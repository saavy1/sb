import logger from "@nexus/logger";
import { chat } from "@tanstack/ai";
import { createChatAdapter, hasAiProvider } from "../../infra/ai";
import { getAiModel } from "../core/functions";
import type { ExtractionResultType } from "./types";

const log = logger.child({ module: "memory-extraction" });

const EXTRACTION_PROMPT = `You are a knowledge extraction system for a homelab agent called "The Machine". Given a conversation, extract structured knowledge as JSON.

## Known Entities
{KNOWN_ENTITIES}

## Instructions
- Extract entities: servers, services, users, kubernetes nodes, namespaces, alert rules, apps, secrets
- Use the EXACT name of known entities when they match — do not create duplicates
- Extract facts as concise natural-language statements (one sentence each)
- Rate confidence 0.0-1.0 based on how certain the information is
- Extract relationships between entities (use RELATES_TO for general associations)
- Only extract meaningful, durable knowledge — skip ephemeral status checks and greetings
- Entity types must be one of: server, service, user, node, namespace, alert_rule, app, secret

Return ONLY valid JSON with this exact structure, no markdown fences:
{"entities": [{"name": "string", "type": "string", "properties": {"key": "value"}}], "facts": [{"content": "string", "entities": ["entity-name"], "confidence": 0.95}], "relationships": [{"from": "entity-name", "to": "entity-name", "type": "RELATES_TO"}]}

If no meaningful knowledge can be extracted, return: {"entities": [], "facts": [], "relationships": []}`;

/**
 * Extract knowledge from a conversation using the LLM.
 */
export async function extractKnowledge(
	messages: { role: string; content: string }[],
	knownEntities: string[],
): Promise<ExtractionResultType> {
	if (!hasAiProvider()) {
		log.warn("AI provider not configured, skipping extraction");
		return { entities: [], facts: [], relationships: [] };
	}

	const model = await getAiModel();
	const adapter = createChatAdapter(model);

	// Build a condensed conversation transcript
	const transcript = messages
		.filter((m) => m.role === "user" || m.role === "assistant")
		.map((m) => {
			const content =
				typeof m.content === "string"
					? m.content
					: JSON.stringify(m.content);
			return `${m.role === "user" ? "User" : "The Machine"}: ${content}`;
		})
		.join("\n\n");

	// Truncate to avoid very long conversations blowing up context
	const maxLength = 12000;
	const truncatedTranscript =
		transcript.length > maxLength
			? `${transcript.slice(0, maxLength)}\n\n[...conversation truncated...]`
			: transcript;

	const entityList =
		knownEntities.length > 0
			? knownEntities.join(", ")
			: "(none yet — this is a new graph)";

	const systemPrompt = EXTRACTION_PROMPT.replace(
		"{KNOWN_ENTITIES}",
		entityList,
	);

	try {
		const response = await chat({
			adapter,
			systemPrompts: [systemPrompt],
			messages: [{ role: "user", content: truncatedTranscript }],
			maxTokens: 2000,
			stream: false,
		});

		const parsed = parseExtractionResponse(response);
		log.info(
			{
				entities: parsed.entities.length,
				facts: parsed.facts.length,
				relationships: parsed.relationships.length,
			},
			"Extracted knowledge from conversation",
		);
		return parsed;
	} catch (error) {
		log.error({ error }, "Failed to extract knowledge");
		return { entities: [], facts: [], relationships: [] };
	}
}

function parseExtractionResponse(response: string): ExtractionResultType {
	// Strip markdown fences if present
	let cleaned = response.trim();
	if (cleaned.startsWith("```")) {
		cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
	}

	try {
		const parsed = JSON.parse(cleaned);

		// Validate structure minimally
		const entities = Array.isArray(parsed.entities) ? parsed.entities : [];
		const facts = Array.isArray(parsed.facts) ? parsed.facts : [];
		const relationships = Array.isArray(parsed.relationships)
			? parsed.relationships
			: [];

		// Filter valid entities
		const validTypes = new Set([
			"server",
			"service",
			"user",
			"node",
			"namespace",
			"alert_rule",
			"app",
			"secret",
		]);

		return {
			entities: entities.filter(
				(e: { name?: string; type?: string }) =>
					typeof e.name === "string" &&
					typeof e.type === "string" &&
					validTypes.has(e.type),
			),
			facts: facts.filter(
				(f: { content?: string; entities?: string[]; confidence?: number }) =>
					typeof f.content === "string" &&
					Array.isArray(f.entities) &&
					typeof f.confidence === "number",
			),
			relationships: relationships.filter(
				(r: { from?: string; to?: string; type?: string }) =>
					typeof r.from === "string" &&
					typeof r.to === "string" &&
					typeof r.type === "string",
			),
		};
	} catch (error) {
		log.error({ error, response: cleaned.slice(0, 200) }, "Failed to parse extraction JSON");
		return { entities: [], facts: [], relationships: [] };
	}
}
