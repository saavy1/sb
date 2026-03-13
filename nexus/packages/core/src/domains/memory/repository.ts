import logger from "@nexus/logger";
import { getGraph } from "../../infra/graph";
import type {
	EntityTypeValue,
	EntityWithContextType,
	MemoryEntityType,
	MemoryFactType,
} from "./types";

const log = logger.child({ module: "memory-repository" });

/**
 * Create indexes on first connection. Safe to call multiple times.
 */
export async function ensureIndexes(): Promise<void> {
	const graph = await getGraph();
	try {
		await graph.query("CREATE INDEX FOR (e:Entity) ON (e.name)");
	} catch {
		// Index may already exist
	}
	try {
		await graph.query("CREATE INDEX FOR (e:Entity) ON (e.type)");
	} catch {
		// Index may already exist
	}
	try {
		await graph.query("CREATE INDEX FOR (f:Fact) ON (f.createdAt)");
	} catch {
		// Index may already exist
	}
	log.info("Graph indexes ensured");
}

/**
 * Upsert an entity node. Creates if not exists, updates lastSeen.
 */
export async function upsertEntity(entity: {
	name: string;
	type: EntityTypeValue;
	properties?: Record<string, string>;
}): Promise<void> {
	const graph = await getGraph();
	const now = new Date().toISOString();
	const props = entity.properties ? JSON.stringify(entity.properties) : "{}";

	await graph.query(
		`MERGE (e:Entity {name: $name})
		 ON CREATE SET e.type = $type, e.properties = $props, e.firstSeen = $now, e.lastSeen = $now
		 ON MATCH SET e.lastSeen = $now, e.type = $type, e.properties = $props`,
		{
			params: {
				name: entity.name,
				type: entity.type,
				props,
				now,
			},
		},
	);
}

/**
 * Create a fact and link it to entities via HAS_FACT and ABOUT edges.
 * Returns the generated fact ID.
 */
export async function createFact(
	content: string,
	entityNames: string[],
	confidence: number,
	source: string,
): Promise<string> {
	const graph = await getGraph();
	const id = crypto.randomUUID().slice(0, 12);
	const now = new Date().toISOString();

	// Create the fact node
	await graph.query(
		`CREATE (f:Fact {id: $id, content: $content, confidence: $confidence, source: $source, createdAt: $now, superseded: false})`,
		{
			params: { id, content, confidence, source, now },
		},
	);

	// Link to entities
	for (const entityName of entityNames) {
		await graph.query(
			`MATCH (e:Entity {name: $entityName}), (f:Fact {id: $factId})
			 MERGE (e)-[:HAS_FACT]->(f)`,
			{
				params: { entityName, factId: id },
			},
		);
	}

	return id;
}

/**
 * Mark an old fact as superseded and link the new one via SUPERSEDES.
 */
export async function supersedeFact(
	oldFactId: string,
	newFactId: string,
): Promise<void> {
	const graph = await getGraph();
	await graph.query(
		`MATCH (old:Fact {id: $oldId}), (new:Fact {id: $newId})
		 SET old.superseded = true
		 MERGE (new)-[:SUPERSEDES]->(old)`,
		{
			params: { oldId: oldFactId, newId: newFactId },
		},
	);
}

/**
 * Create a Conversation node and link it to entities and facts.
 */
export async function linkConversation(
	threadId: string,
	title: string | null,
	source: string,
	entityNames: string[],
	factIds: string[],
): Promise<void> {
	const graph = await getGraph();
	const now = new Date().toISOString();

	await graph.query(
		`MERGE (c:Conversation {threadId: $threadId})
		 ON CREATE SET c.title = $title, c.source = $source, c.createdAt = $now
		 ON MATCH SET c.title = $title`,
		{
			params: { threadId, title: title ?? "", source, now },
		},
	);

	for (const entityName of entityNames) {
		await graph.query(
			`MATCH (c:Conversation {threadId: $threadId}), (e:Entity {name: $entityName})
			 MERGE (c)-[:INVOLVED]->(e)`,
			{ params: { threadId, entityName } },
		);
	}

	for (const factId of factIds) {
		await graph.query(
			`MATCH (c:Conversation {threadId: $threadId}), (f:Fact {id: $factId})
			 MERGE (c)-[:PRODUCED]->(f)`,
			{ params: { threadId, factId } },
		);
	}
}

/**
 * Create a relationship between two entities.
 */
export async function relateEntities(
	fromName: string,
	toName: string,
	relType: string,
): Promise<void> {
	const graph = await getGraph();
	// Cypher doesn't allow parameterized relationship types, so we sanitize
	const safeType = relType.replace(/[^A-Z_]/g, "");
	await graph.query(
		`MATCH (a:Entity {name: $from}), (b:Entity {name: $to})
		 MERGE (a)-[:${safeType}]->(b)`,
		{ params: { from: fromName, to: toName } },
	);
}

/**
 * Recall facts for a specific entity, ordered by recency.
 */
export async function recallByEntity(
	name: string,
	limit = 10,
): Promise<MemoryFactType[]> {
	const graph = await getGraph();
	const result = await graph.query(
		`MATCH (e:Entity {name: $name})-[:HAS_FACT]->(f:Fact)
		 WHERE f.superseded = false
		 RETURN f.id, f.content, f.confidence, f.source, f.createdAt, f.superseded
		 ORDER BY f.createdAt DESC
		 LIMIT $limit`,
		{ params: { name, limit } },
	);

	return parseFactRows(result.data);
}

/**
 * Recall facts matching keywords in content.
 */
export async function recallByKeywords(
	keywords: string[],
	limit = 10,
): Promise<MemoryFactType[]> {
	const graph = await getGraph();
	// Build a WHERE clause matching any keyword (case-insensitive via toLower)
	const conditions = keywords
		.map((_, i) => `toLower(f.content) CONTAINS toLower($kw${i})`)
		.join(" OR ");
	const params: Record<string, string | number | boolean> = { limit };
	for (let i = 0; i < keywords.length; i++) {
		params[`kw${i}`] = keywords[i];
	}

	const result = await graph.query(
		`MATCH (f:Fact)
		 WHERE f.superseded = false AND (${conditions})
		 RETURN f.id, f.content, f.confidence, f.source, f.createdAt, f.superseded
		 ORDER BY f.createdAt DESC
		 LIMIT $limit`,
		{ params },
	);

	return parseFactRows(result.data);
}

/**
 * Get everything known about an entity: facts, related entities.
 */
export async function getEntityWithContext(
	name: string,
): Promise<EntityWithContextType | null> {
	const graph = await getGraph();

	// Get entity
	const entityResult = await graph.query(
		`MATCH (e:Entity {name: $name})
		 RETURN e.name, e.type, e.properties, e.firstSeen, e.lastSeen`,
		{ params: { name } },
	);

	if (!entityResult.data || entityResult.data.length === 0) return null;

	const row = entityResult.data[0] as string[];
	const entity: MemoryEntityType = {
		name: row[0],
		type: row[1] as MemoryEntityType["type"],
		properties: row[2] ? safeParseJson(row[2]) : undefined,
		firstSeen: row[3],
		lastSeen: row[4],
	};

	// Get facts
	const facts = await recallByEntity(name, 20);

	// Get related entities
	const relatedResult = await graph.query(
		`MATCH (e:Entity {name: $name})-[:RELATES_TO]-(r:Entity)
		 RETURN r.name, r.type, r.properties, r.firstSeen, r.lastSeen
		 LIMIT 10`,
		{ params: { name } },
	);

	const relatedEntities = parseEntityRows(relatedResult.data);

	return { entity, facts, relatedEntities };
}

/**
 * Get all known entity names (for NER matching).
 */
export async function getKnownEntityNames(): Promise<string[]> {
	const graph = await getGraph();
	const result = await graph.query("MATCH (e:Entity) RETURN e.name");

	if (!result.data) return [];
	return (result.data as string[][]).map((row) => row[0]);
}

/**
 * Get graph statistics.
 */
export async function getGraphStats(): Promise<{
	entityCount: number;
	factCount: number;
	conversationCount: number;
	incidentCount: number;
}> {
	const graph = await getGraph();

	const counts = await Promise.all([
		graph.query("MATCH (e:Entity) RETURN count(e)"),
		graph.query("MATCH (f:Fact) RETURN count(f)"),
		graph.query("MATCH (c:Conversation) RETURN count(c)"),
		graph.query("MATCH (i:Incident) RETURN count(i)"),
	]);

	const getCount = (result: { data?: unknown[] }) => {
		if (!result.data || result.data.length === 0) return 0;
		const row = result.data[0] as number[];
		return Number(row[0]) || 0;
	};

	return {
		entityCount: getCount(counts[0]),
		factCount: getCount(counts[1]),
		conversationCount: getCount(counts[2]),
		incidentCount: getCount(counts[3]),
	};
}

/**
 * List all entities, optionally filtered by type.
 */
export async function listEntities(
	type?: EntityTypeValue,
	limit = 50,
): Promise<MemoryEntityType[]> {
	const graph = await getGraph();

	const query = type
		? `MATCH (e:Entity {type: $type}) RETURN e.name, e.type, e.properties, e.firstSeen, e.lastSeen ORDER BY e.lastSeen DESC LIMIT $limit`
		: `MATCH (e:Entity) RETURN e.name, e.type, e.properties, e.firstSeen, e.lastSeen ORDER BY e.lastSeen DESC LIMIT $limit`;

	const params: Record<string, string | number> = { limit };
	if (type) params.type = type;

	const result = await graph.query(query, { params });
	return parseEntityRows(result.data);
}

/**
 * List recent facts.
 */
export async function listFacts(
	limit = 20,
	offset = 0,
): Promise<MemoryFactType[]> {
	const graph = await getGraph();
	const result = await graph.query(
		`MATCH (f:Fact)
		 WHERE f.superseded = false
		 RETURN f.id, f.content, f.confidence, f.source, f.createdAt, f.superseded
		 ORDER BY f.createdAt DESC
		 SKIP $offset
		 LIMIT $limit`,
		{ params: { limit, offset } },
	);

	return parseFactRows(result.data);
}

// === Parsing helpers ===

function parseFactRows(data: unknown[] | undefined): MemoryFactType[] {
	if (!data) return [];
	return (data as (string | number | boolean)[][]).map((row) => ({
		id: String(row[0]),
		content: String(row[1]),
		confidence: Number(row[2]),
		source: String(row[3]),
		createdAt: String(row[4]),
		superseded: Boolean(row[5]),
	}));
}

function parseEntityRows(data: unknown[] | undefined): MemoryEntityType[] {
	if (!data) return [];
	return (data as string[][]).map((row) => ({
		name: row[0],
		type: row[1] as MemoryEntityType["type"],
		properties: row[2] ? safeParseJson(row[2]) : undefined,
		firstSeen: row[3],
		lastSeen: row[4],
	}));
}

function safeParseJson(value: string): Record<string, string> | undefined {
	try {
		return JSON.parse(value);
	} catch {
		return undefined;
	}
}
