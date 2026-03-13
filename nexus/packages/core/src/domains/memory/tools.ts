import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import * as memoryRepo from "./repository";
import { invalidateEntityCache } from "./functions";

const rememberTool = toolDefinition({
	name: "remember",
	description: `Store an important fact in long-term memory for future conversations.
Use this when you learn something worth remembering — user preferences, resolution steps, entity relationships, configuration details.

- fact: A concise natural-language statement of what you learned
- entities: Names of entities this fact relates to (servers, services, users, apps, etc.)
- confidence: How certain you are (0.0-1.0, default 0.9)

Example: remember({ fact: "minecraft-smp uses the Better MC modpack", entities: ["minecraft-smp"], confidence: 0.95 })`,
	inputSchema: z.object({
		fact: z.string().describe("Concise statement of what to remember"),
		entities: z
			.array(z.string())
			.describe("Entity names this fact relates to"),
		confidence: z
			.number()
			.min(0)
			.max(1)
			.optional()
			.describe("Confidence level 0.0-1.0 (default 0.9)"),
	}),
}).server(async ({ fact, entities, confidence }) => {
	const conf = confidence ?? 0.9;

	// Ensure entities exist
	for (const name of entities) {
		await memoryRepo.upsertEntity({ name, type: "service" });
	}

	const factId = await memoryRepo.createFact(
		fact,
		entities,
		conf,
		"agent-explicit",
	);

	invalidateEntityCache();

	return {
		stored: true,
		factId,
		entities,
		message: `Remembered: "${fact}" (linked to ${entities.join(", ")})`,
	};
});

const recallMemoryTool = toolDefinition({
	name: "recall_memory",
	description: `Search long-term memory for facts by keyword or entity name.
Use this when you need to recall information from past conversations.

- query: Keywords to search for in fact content
- entityName: Optional — filter to facts about a specific entity
- limit: Max results (default 10)

Example: recall_memory({ query: "modpack", entityName: "minecraft-smp" })`,
	inputSchema: z.object({
		query: z.string().describe("Keywords to search for"),
		entityName: z
			.string()
			.optional()
			.describe("Filter to a specific entity"),
		limit: z.number().optional().describe("Max results (default 10)"),
	}),
}).server(async ({ query, entityName, limit }) => {
	const maxResults = limit ?? 10;

	if (entityName) {
		const facts = await memoryRepo.recallByEntity(entityName, maxResults);
		return {
			facts,
			message:
				facts.length > 0
					? `Found ${facts.length} facts about ${entityName}`
					: `No facts found about ${entityName}`,
		};
	}

	const keywords = query
		.split(/\s+/)
		.filter((w) => w.length > 2);

	if (keywords.length === 0) {
		return { facts: [], message: "No valid search keywords provided" };
	}

	const facts = await memoryRepo.recallByKeywords(keywords, maxResults);
	return {
		facts,
		message:
			facts.length > 0
				? `Found ${facts.length} facts matching "${query}"`
				: `No facts found matching "${query}"`,
	};
});

const recallEntityTool = toolDefinition({
	name: "recall_entity",
	description: `Get everything known about a specific entity — all facts, related entities, and context.
Use this for a deep lookup on a server, service, user, app, etc.

- name: The entity name to look up

Example: recall_entity({ name: "minecraft-smp" })`,
	inputSchema: z.object({
		name: z.string().describe("Entity name to look up"),
	}),
}).server(async ({ name }) => {
	const context = await memoryRepo.getEntityWithContext(name);

	if (!context) {
		return {
			found: false,
			message: `No entity found with name "${name}"`,
		};
	}

	return {
		found: true,
		entity: context.entity,
		facts: context.facts,
		relatedEntities: context.relatedEntities,
		message: `Found ${context.facts.length} facts about ${name}`,
	};
});

export const memoryTools = [rememberTool, recallMemoryTool, recallEntityTool];
