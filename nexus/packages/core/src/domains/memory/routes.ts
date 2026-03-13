import { Elysia } from "elysia";
import * as memoryRepo from "./repository";
import {
	EntitiesQueryParams,
	EntityNameParam,
	FactsQueryParams,
	MemoryStatsResponse,
	SearchQueryParams,
} from "./types";

export const memoryRoutes = new Elysia({ prefix: "/memory" })
	.get(
		"/stats",
		async () => {
			return memoryRepo.getGraphStats();
		},
		{
			response: MemoryStatsResponse,
		},
	)
	.get(
		"/entities",
		async ({ query }) => {
			const limit = query.limit ? parseInt(query.limit, 10) : 50;
			return memoryRepo.listEntities(query.type, limit);
		},
		{
			query: EntitiesQueryParams,
		},
	)
	.get(
		"/entities/:name",
		async ({ params, set }) => {
			const result = await memoryRepo.getEntityWithContext(params.name);
			if (!result) {
				set.status = 404;
				return { error: "Entity not found" };
			}
			return result;
		},
		{
			params: EntityNameParam,
		},
	)
	.get(
		"/facts",
		async ({ query }) => {
			const limit = query.limit ? parseInt(query.limit, 10) : 20;
			const offset = query.offset ? parseInt(query.offset, 10) : 0;
			return memoryRepo.listFacts(limit, offset);
		},
		{
			query: FactsQueryParams,
		},
	)
	.get(
		"/search",
		async ({ query }) => {
			const keywords = query.q
				.split(/\s+/)
				.filter((w) => w.length > 1);
			const limit = query.limit ? parseInt(query.limit, 10) : 20;
			if (keywords.length === 0) return [];
			return memoryRepo.recallByKeywords(keywords, limit);
		},
		{
			query: SearchQueryParams,
		},
	);
