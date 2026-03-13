import logger from "@nexus/logger";
import { createWorker, QUEUES } from "../../infra/queue";
import { agentRepository } from "../agent/repository";
import { extractKnowledge } from "./extraction";
import * as memoryRepo from "./repository";
import type { MemoryExtractionJobDataType } from "./types";

const log = logger.child({ module: "memory-worker" });

/**
 * Start the memory extraction worker.
 * Processes completed threads: extracts knowledge and writes to FalkorDB.
 */
export function startMemoryExtractionWorker() {
	return createWorker<MemoryExtractionJobDataType>(
		QUEUES.MEMORY_EXTRACTION,
		async (job) => {
			const { threadId } = job.data;
			log.info({ threadId }, "Starting memory extraction");

			// Load thread
			const thread = await agentRepository.findById(threadId);
			if (!thread) {
				log.warn({ threadId }, "Thread not found for extraction, skipping");
				return;
			}

			if (!thread.messages || thread.messages.length === 0) {
				log.warn({ threadId }, "Thread has no messages, skipping extraction");
				return;
			}

			// Flatten messages to simple role/content pairs
			const messages = thread.messages
				.filter(
					(m: { role: string; content?: unknown }) =>
						m.role === "user" || m.role === "assistant",
				)
				.map((m: { role: string; content?: unknown }) => ({
					role: m.role,
					content:
						typeof m.content === "string"
							? m.content
							: JSON.stringify(m.content),
				}));

			if (messages.length === 0) {
				log.info({ threadId }, "No user/assistant messages to extract from");
				return;
			}

			// Get known entities for dedup
			let knownEntities: string[] = [];
			try {
				knownEntities = await memoryRepo.getKnownEntityNames();
			} catch (error) {
				log.warn({ error }, "Failed to get known entities, proceeding without");
			}

			// Extract knowledge via LLM
			const result = await extractKnowledge(messages, knownEntities);

			if (
				result.entities.length === 0 &&
				result.facts.length === 0 &&
				result.relationships.length === 0
			) {
				log.info({ threadId }, "No knowledge extracted from conversation");
				return;
			}

			// Write to graph
			// 1. Upsert entities
			for (const entity of result.entities) {
				await memoryRepo.upsertEntity(entity);
			}

			// 2. Create facts and link to entities
			const factIds: string[] = [];
			for (const fact of result.facts) {
				const factId = await memoryRepo.createFact(
					fact.content,
					fact.entities,
					fact.confidence,
					threadId,
				);
				factIds.push(factId);
			}

			// 3. Create entity relationships
			for (const rel of result.relationships) {
				await memoryRepo.relateEntities(rel.from, rel.to, rel.type);
			}

			// 4. Link conversation to entities and facts
			const allEntityNames = result.entities.map((e) => e.name);
			await memoryRepo.linkConversation(
				threadId,
				thread.title,
				thread.source,
				allEntityNames,
				factIds,
			);

			log.info(
				{
					threadId,
					entities: result.entities.length,
					facts: result.facts.length,
					relationships: result.relationships.length,
				},
				"Memory extraction complete",
			);
		},
		{ concurrency: 1 },
	);
}
