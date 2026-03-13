import logger from "@nexus/logger";
import * as memoryRepo from "./repository";
import type { MemoryFactType } from "./types";

const log = logger.child({ module: "memory" });

// === Entity name cache (refreshed every 5 minutes) ===

let entityNameCache: string[] = [];
let entityCacheUpdatedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getEntityNames(): Promise<string[]> {
	const now = Date.now();
	if (now - entityCacheUpdatedAt < CACHE_TTL_MS && entityNameCache.length > 0) {
		return entityNameCache;
	}

	try {
		entityNameCache = await memoryRepo.getKnownEntityNames();
		entityCacheUpdatedAt = now;
	} catch (error) {
		log.warn({ error }, "Failed to refresh entity name cache");
		// Return stale cache if available
	}
	return entityNameCache;
}

/**
 * Invalidate the entity name cache (call after extraction writes new entities).
 */
export function invalidateEntityCache(): void {
	entityCacheUpdatedAt = 0;
}

/**
 * Find entity names mentioned in a text string.
 * Case-insensitive substring match against known entity names.
 */
async function findMentionedEntities(text: string): Promise<string[]> {
	const knownNames = await getEntityNames();
	if (knownNames.length === 0) return [];

	const lowerText = text.toLowerCase();
	return knownNames.filter((name) => lowerText.includes(name.toLowerCase()));
}

/**
 * Recall relevant memory context for a message.
 * Returns a formatted markdown string to inject into the system prompt,
 * or null if nothing relevant was found.
 */
export async function recallForMessage(
	message: string,
	threadSource?: string,
	threadContext?: Record<string, unknown>,
): Promise<string | null> {
	try {
		// Find entities mentioned in the message
		const mentionedEntities = await findMentionedEntities(message);

		// If this is an alert thread, also try to extract entity from alert labels
		if (threadSource === "alert" && threadContext?.alert) {
			const alert = threadContext.alert as {
				name?: string;
				labels?: Record<string, string>;
			};
			if (alert.name) {
				const alertEntities = await findMentionedEntities(alert.name);
				for (const e of alertEntities) {
					if (!mentionedEntities.includes(e)) mentionedEntities.push(e);
				}
			}
			// Check common label values
			if (alert.labels) {
				for (const value of Object.values(alert.labels)) {
					const labelEntities = await findMentionedEntities(value);
					for (const e of labelEntities) {
						if (!mentionedEntities.includes(e)) mentionedEntities.push(e);
					}
				}
			}
		}

		if (mentionedEntities.length === 0) {
			// Try keyword-based recall as fallback
			const keywords = extractKeywords(message);
			if (keywords.length === 0) return null;

			const facts = await memoryRepo.recallByKeywords(keywords, 10);
			if (facts.length === 0) return null;

			return formatMemoryContext(facts);
		}

		// Recall facts for each mentioned entity
		const allFacts: MemoryFactType[] = [];
		const seenIds = new Set<string>();

		for (const entityName of mentionedEntities) {
			const facts = await memoryRepo.recallByEntity(entityName, 8);
			for (const fact of facts) {
				if (!seenIds.has(fact.id)) {
					seenIds.add(fact.id);
					allFacts.push(fact);
				}
			}
		}

		if (allFacts.length === 0) return null;

		// Sort by recency and limit
		allFacts.sort(
			(a, b) =>
				new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
		);
		const limited = allFacts.slice(0, 15);

		return formatMemoryContext(limited, mentionedEntities);
	} catch (error) {
		log.warn({ error }, "Memory recall failed, continuing without memory");
		return null;
	}
}

function formatMemoryContext(
	facts: MemoryFactType[],
	entities?: string[],
): string {
	const lines = ["\n\n## Memory (from past conversations)"];

	if (entities && entities.length > 0) {
		lines.push(`Entities recognized: ${entities.join(", ")}`);
	}

	lines.push("");
	for (const fact of facts) {
		const date = fact.createdAt.split("T")[0];
		lines.push(`- ${fact.content} (${date}, confidence: ${fact.confidence})`);
	}

	// Cap total length
	const result = lines.join("\n");
	if (result.length > 2000) {
		return `${result.slice(0, 1997)}...`;
	}
	return result;
}

/**
 * Extract simple keywords from a message for fallback recall.
 * Filters out common stop words and short tokens.
 */
function extractKeywords(message: string): string[] {
	const stopWords = new Set([
		"the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
		"have", "has", "had", "do", "does", "did", "will", "would", "could",
		"should", "may", "might", "can", "shall", "to", "of", "in", "for",
		"on", "with", "at", "by", "from", "as", "into", "through", "during",
		"before", "after", "above", "below", "between", "out", "off", "over",
		"under", "again", "further", "then", "once", "here", "there", "when",
		"where", "why", "how", "all", "each", "every", "both", "few", "more",
		"most", "other", "some", "such", "no", "nor", "not", "only", "own",
		"same", "so", "than", "too", "very", "just", "because", "but", "and",
		"or", "if", "while", "about", "what", "which", "who", "whom", "this",
		"that", "these", "those", "am", "it", "its", "my", "me", "we", "our",
		"you", "your", "he", "him", "his", "she", "her", "they", "them", "their",
		"i", "up", "hey", "hi", "hello", "please", "thanks", "thank",
	]);

	return message
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, " ")
		.split(/\s+/)
		.filter((w) => w.length > 2 && !stopWords.has(w))
		.slice(0, 5);
}
