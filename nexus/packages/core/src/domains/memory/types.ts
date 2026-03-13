import { t } from "elysia";

// === Entity types ===

export const EntityType = t.Union([
	t.Literal("server"),
	t.Literal("service"),
	t.Literal("user"),
	t.Literal("node"),
	t.Literal("namespace"),
	t.Literal("alert_rule"),
	t.Literal("app"),
	t.Literal("secret"),
]);
export type EntityTypeValue = typeof EntityType.static;

export const MemoryEntity = t.Object({
	name: t.String(),
	type: EntityType,
	properties: t.Optional(t.Record(t.String(), t.String())),
	firstSeen: t.String(),
	lastSeen: t.String(),
});
export type MemoryEntityType = typeof MemoryEntity.static;

export const MemoryFact = t.Object({
	id: t.String(),
	content: t.String(),
	confidence: t.Number(),
	source: t.String(),
	createdAt: t.String(),
	superseded: t.Boolean(),
});
export type MemoryFactType = typeof MemoryFact.static;

// === Extraction schemas ===

export const ExtractedEntity = t.Object({
	name: t.String(),
	type: EntityType,
	properties: t.Optional(t.Record(t.String(), t.String())),
});
export type ExtractedEntityType = typeof ExtractedEntity.static;

export const ExtractedFact = t.Object({
	content: t.String(),
	entities: t.Array(t.String()),
	confidence: t.Number(),
});
export type ExtractedFactType = typeof ExtractedFact.static;

export const ExtractedRelationship = t.Object({
	from: t.String(),
	to: t.String(),
	type: t.String(),
});
export type ExtractedRelationshipType = typeof ExtractedRelationship.static;

export const ExtractionResult = t.Object({
	entities: t.Array(ExtractedEntity),
	facts: t.Array(ExtractedFact),
	relationships: t.Array(ExtractedRelationship),
});
export type ExtractionResultType = typeof ExtractionResult.static;

// === Recall schemas ===

export const RecallResult = t.Object({
	facts: t.Array(MemoryFact),
	entities: t.Array(MemoryEntity),
});
export type RecallResultType = typeof RecallResult.static;

export const EntityWithContext = t.Object({
	entity: MemoryEntity,
	facts: t.Array(MemoryFact),
	relatedEntities: t.Array(MemoryEntity),
});
export type EntityWithContextType = typeof EntityWithContext.static;

// === API schemas ===

export const MemoryStatsResponse = t.Object({
	entityCount: t.Number(),
	factCount: t.Number(),
	conversationCount: t.Number(),
	incidentCount: t.Number(),
});

export const EntitiesQueryParams = t.Object({
	type: t.Optional(EntityType),
	limit: t.Optional(t.String()),
});

export const FactsQueryParams = t.Object({
	limit: t.Optional(t.String()),
	offset: t.Optional(t.String()),
});

export const SearchQueryParams = t.Object({
	q: t.String(),
	limit: t.Optional(t.String()),
});

export const EntityNameParam = t.Object({
	name: t.String(),
});

// === Worker job data ===

export const MemoryExtractionJobData = t.Object({
	threadId: t.String(),
});
export type MemoryExtractionJobDataType = typeof MemoryExtractionJobData.static;
