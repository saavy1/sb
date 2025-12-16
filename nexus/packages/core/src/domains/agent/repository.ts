import { and, desc, eq, sql } from "drizzle-orm";
import { agentDb } from "../../infra/db";
import type { AgentThread, NewAgentThread, ThreadContext } from "./schema";
import { agentThreads } from "./schema";
import type { ThreadMessageType, ThreadSourceType, ThreadStatusType } from "./types";

export class OptimisticLockError extends Error {
	constructor(id: string) {
		super(`Optimistic lock conflict on thread ${id}`);
		this.name = "OptimisticLockError";
	}
}

export const agentRepository = {
	async create(data: NewAgentThread): Promise<AgentThread> {
		const [thread] = await agentDb.insert(agentThreads).values(data).returning();
		return thread;
	},

	async findById(id: string): Promise<AgentThread | null> {
		const [thread] = await agentDb.select().from(agentThreads).where(eq(agentThreads.id, id));
		return thread ?? null;
	},

	async findBySourceId(source: ThreadSourceType, sourceId: string): Promise<AgentThread | null> {
		const [thread] = await agentDb
			.select()
			.from(agentThreads)
			.where(and(eq(agentThreads.source, source), eq(agentThreads.sourceId, sourceId)));
		return thread ?? null;
	},

	async findAll(options?: {
		status?: ThreadStatusType;
		source?: ThreadSourceType;
		limit?: number;
	}): Promise<AgentThread[]> {
		let query = agentDb.select().from(agentThreads);

		if (options?.status) {
			query = query.where(eq(agentThreads.status, options.status)) as typeof query;
		}
		if (options?.source) {
			query = query.where(eq(agentThreads.source, options.source)) as typeof query;
		}

		return query.orderBy(desc(agentThreads.updatedAt)).limit(options?.limit ?? 50);
	},

	/**
	 * Update with optimistic locking - use when concurrent modifications are possible.
	 * Throws OptimisticLockError if version mismatch.
	 */
	async updateWithLock(
		id: string,
		expectedVersion: number,
		data: Partial<{
			status: ThreadStatusType;
			title: string;
			messages: ThreadMessageType[];
			context: ThreadContext;
			wakeJobId: string | null;
			wakeReason: string | null;
		}>
	): Promise<AgentThread> {
		const [thread] = await agentDb
			.update(agentThreads)
			.set({
				...data,
				version: sql`${agentThreads.version} + 1`,
				updatedAt: new Date(),
			})
			.where(and(eq(agentThreads.id, id), eq(agentThreads.version, expectedVersion)))
			.returning();

		if (!thread) {
			throw new OptimisticLockError(id);
		}
		return thread;
	},

	/**
	 * Simple update without locking - use for non-critical updates.
	 */
	async update(
		id: string,
		data: Partial<{
			status: ThreadStatusType;
			title: string;
			messages: ThreadMessageType[];
			context: ThreadContext;
			wakeJobId: string | null;
			wakeReason: string | null;
		}>
	): Promise<AgentThread | null> {
		const [thread] = await agentDb
			.update(agentThreads)
			.set({
				...data,
				version: sql`${agentThreads.version} + 1`,
				updatedAt: new Date(),
			})
			.where(eq(agentThreads.id, id))
			.returning();
		return thread ?? null;
	},

	async delete(id: string): Promise<boolean> {
		const result = await agentDb.delete(agentThreads).where(eq(agentThreads.id, id)).returning();
		return result.length > 0;
	},

	async setWake(id: string, wakeJobId: string, wakeReason: string): Promise<AgentThread | null> {
		const [thread] = await agentDb
			.update(agentThreads)
			.set({
				status: "sleeping",
				wakeJobId,
				wakeReason,
				version: sql`${agentThreads.version} + 1`,
				updatedAt: new Date(),
			})
			.where(eq(agentThreads.id, id))
			.returning();
		return thread ?? null;
	},

	async clearWake(id: string): Promise<AgentThread | null> {
		const [thread] = await agentDb
			.update(agentThreads)
			.set({
				status: "active",
				wakeJobId: null,
				wakeReason: null,
				version: sql`${agentThreads.version} + 1`,
				updatedAt: new Date(),
			})
			.where(eq(agentThreads.id, id))
			.returning();
		return thread ?? null;
	},
};
