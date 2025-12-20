import { t } from "elysia";

// === Media Status (matches Jellyseerr's MediaStatus enum) ===

export const MediaStatus = t.Union([
	t.Literal(1), // UNKNOWN
	t.Literal(2), // PENDING
	t.Literal(3), // PROCESSING
	t.Literal(4), // PARTIALLY_AVAILABLE
	t.Literal(5), // AVAILABLE
	t.Literal(6), // BLACKLISTED
	t.Literal(7), // DELETED
]);
export type MediaStatusType = typeof MediaStatus.static;

// Human-readable status mapping
export const MediaStatusLabels: Record<number, string> = {
	1: "unknown",
	2: "pending",
	3: "processing",
	4: "partially available",
	5: "available",
	6: "blacklisted",
	7: "deleted",
};

// === Internal schemas (for fetch helper) ===

export const JellyseerrRequestOptions = t.Object({
	method: t.Optional(t.Union([t.Literal("GET"), t.Literal("POST"), t.Literal("PUT"), t.Literal("DELETE")])),
	body: t.Optional(t.Unknown()),
});
export type JellyseerrRequestOptionsType = typeof JellyseerrRequestOptions.static;

// === Jellyseerr API Response Schemas ===

// MediaInfo attached to search results (partial - only what we use)
export const SearchResultMediaInfo = t.Object({
	status: t.Optional(t.Number()),
	status4k: t.Optional(t.Number()),
});
export type SearchResultMediaInfoType = typeof SearchResultMediaInfo.static;

// Search result item (unified for movie/tv, API returns mixed)
export const SearchResultItem = t.Object({
	id: t.Number(),
	mediaType: t.String(),
	title: t.Optional(t.String()), // movies
	name: t.Optional(t.String()), // tv shows
	releaseDate: t.Optional(t.Nullable(t.String())), // movies
	firstAirDate: t.Optional(t.Nullable(t.String())), // tv shows
	overview: t.Optional(t.String()),
	mediaInfo: t.Optional(SearchResultMediaInfo),
});
export type SearchResultItemType = typeof SearchResultItem.static;

// Search response from /api/v1/search
export const SearchResponse = t.Object({
	page: t.Number(),
	totalPages: t.Number(),
	totalResults: t.Number(),
	results: t.Array(SearchResultItem),
});
export type SearchResponseType = typeof SearchResponse.static;

// === TV Show Details ===

export const TvSeasonInfo = t.Object({
	seasonNumber: t.Number(),
	status: t.Number(),
	status4k: t.Optional(t.Number()),
});
export type TvSeasonInfoType = typeof TvSeasonInfo.static;

export const TvDetailsMediaInfo = t.Object({
	id: t.Number(),
	status: t.Optional(t.Number()),
	status4k: t.Optional(t.Number()),
	seasons: t.Optional(t.Array(TvSeasonInfo)),
});
export type TvDetailsMediaInfoType = typeof TvDetailsMediaInfo.static;

export const TvDetailsResponse = t.Object({
	id: t.Number(),
	name: t.String(),
	overview: t.Optional(t.String()),
	firstAirDate: t.Optional(t.Nullable(t.String())),
	status: t.Optional(t.String()), // e.g., "Ended", "Returning Series"
	numberOfSeasons: t.Optional(t.Number()),
	numberOfEpisodes: t.Optional(t.Number()),
	mediaInfo: t.Optional(TvDetailsMediaInfo),
});
export type TvDetailsResponseType = typeof TvDetailsResponse.static;

// === Movie Details ===

export const MovieDetailsMediaInfo = t.Object({
	id: t.Number(),
	status: t.Optional(t.Number()),
	status4k: t.Optional(t.Number()),
});
export type MovieDetailsMediaInfoType = typeof MovieDetailsMediaInfo.static;

export const MovieDetailsResponse = t.Object({
	id: t.Number(),
	title: t.String(),
	overview: t.Optional(t.String()),
	releaseDate: t.Optional(t.Nullable(t.String())),
	status: t.Optional(t.String()), // e.g., "Released"
	runtime: t.Optional(t.Nullable(t.Number())),
	mediaInfo: t.Optional(MovieDetailsMediaInfo),
});
export type MovieDetailsResponseType = typeof MovieDetailsResponse.static;

// === SABnzbd API Response Schemas ===

// Individual download slot in the queue
export const SabnzbdQueueSlot = t.Object({
	nzo_id: t.String(),
	filename: t.String(),
	status: t.String(), // Downloading, Queued, Paused, etc.
	percentage: t.String(), // "45" (percentage complete)
	timeleft: t.String(), // "0:12:34" or "unknown"
	mb: t.String(), // Total size in MB
	mbleft: t.String(), // Remaining MB
	cat: t.String(), // Category (tv, movies, etc.)
	priority: t.String(), // Priority level
});
export type SabnzbdQueueSlotType = typeof SabnzbdQueueSlot.static;

// Queue response from SABnzbd
export const SabnzbdQueueResponse = t.Object({
	status: t.String(), // Downloading, Paused, Idle
	paused: t.Boolean(),
	speed: t.String(), // "1.3 M" formatted speed
	kbpersec: t.String(), // Speed in KB/s
	timeleft: t.String(), // Total time remaining
	mb: t.String(), // Total queue size MB
	mbleft: t.String(), // Remaining MB
	noofslots_total: t.Number(), // Total items in queue
	diskspace1: t.String(), // Available disk space
	slots: t.Array(SabnzbdQueueSlot),
});
export type SabnzbdQueueResponseType = typeof SabnzbdQueueResponse.static;

// History slot (completed download)
export const SabnzbdHistorySlot = t.Object({
	nzo_id: t.String(),
	name: t.String(),
	status: t.String(), // Completed, Failed, etc.
	bytes: t.Number(),
	completed: t.Number(), // Unix timestamp
	category: t.String(),
	storage: t.Optional(t.String()), // Path where stored
	fail_message: t.Optional(t.String()),
});
export type SabnzbdHistorySlotType = typeof SabnzbdHistorySlot.static;

// History response from SABnzbd
export const SabnzbdHistoryResponse = t.Object({
	noofslots: t.Number(),
	day_size: t.String(),
	week_size: t.String(),
	month_size: t.String(),
	total_size: t.String(),
	slots: t.Array(SabnzbdHistorySlot),
});
export type SabnzbdHistoryResponseType = typeof SabnzbdHistoryResponse.static;

// === Jellyseerr Request Schemas ===

// Request body for creating a new media request
export const MediaRequestBody = t.Object({
	mediaId: t.Number(), // TMDB ID
	mediaType: t.Union([t.Literal("movie"), t.Literal("tv")]),
	seasons: t.Optional(t.Array(t.Number())), // For TV shows - which seasons to request
	is4k: t.Optional(t.Boolean()), // Request 4K version
});
export type MediaRequestBodyType = typeof MediaRequestBody.static;

// Response from creating a request
export const MediaRequestResponse = t.Object({
	id: t.Number(),
	status: t.Number(),
	createdAt: t.String(),
	updatedAt: t.String(),
	type: t.String(), // "movie" or "tv"
	is4k: t.Boolean(),
	serverId: t.Optional(t.Number()),
	profileId: t.Optional(t.Number()),
	rootFolder: t.Optional(t.String()),
	media: t.Object({
		id: t.Number(),
		mediaType: t.String(),
		tmdbId: t.Number(),
		status: t.Number(),
	}),
});
export type MediaRequestResponseType = typeof MediaRequestResponse.static;
