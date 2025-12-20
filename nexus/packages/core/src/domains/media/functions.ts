import logger from "@nexus/logger";
import { z } from "zod";
import { config } from "../../infra/config";
import { tracedFetch } from "../../infra/telemetry";
import { withTool } from "../../infra/tools";
import {
	MediaStatusLabels,
	type JellyseerrRequestOptionsType,
	type MediaRequestBodyType,
	type MediaRequestResponseType,
	type MovieDetailsResponseType,
	type SabnzbdHistoryResponseType,
	type SabnzbdQueueResponseType,
	type SearchResponseType,
	type TvDetailsResponseType,
} from "./types";

const log = logger.child({ module: "media" });

// === Jellyseerr API Client ===

async function jellyseerrFetch<T>(path: string, options: JellyseerrRequestOptionsType = {}): Promise<T> {
	const url = `${config.JELLYSEERR_URL}/api/v1${path}`;

	if (!config.JELLYSEERR_API_KEY) {
		throw new Error("JELLYSEERR_API_KEY not configured");
	}

	const response = await tracedFetch(url, {
		method: options.method || "GET",
		headers: {
			"X-Api-Key": config.JELLYSEERR_API_KEY,
			"Content-Type": "application/json",
		},
		body: options.body ? JSON.stringify(options.body) : undefined,
	});

	if (!response.ok) {
		const errorText = await response.text();
		log.error({ url, status: response.status, error: errorText }, "Jellyseerr API error");
		throw new Error(`Jellyseerr API error: ${response.status} ${errorText}`);
	}

	return (await response.json()) as T;
}

// === SABnzbd API Client ===

async function sabnzbdFetch<T>(mode: string, params: Record<string, string> = {}): Promise<T> {
	if (!config.SABNZBD_API_KEY) {
		throw new Error("SABNZBD_API_KEY not configured");
	}

	const searchParams = new URLSearchParams({
		output: "json",
		apikey: config.SABNZBD_API_KEY,
		mode,
		...params,
	});

	const url = `${config.SABNZBD_URL}/api?${searchParams.toString()}`;
	const response = await tracedFetch(url);

	if (!response.ok) {
		const errorText = await response.text();
		log.error({ url: url.replace(config.SABNZBD_API_KEY, "***"), status: response.status, error: errorText }, "SABnzbd API error");
		throw new Error(`SABnzbd API error: ${response.status} ${errorText}`);
	}

	const data = (await response.json()) as T & { error?: string };

	// SABnzbd returns errors in the response body
	if (data.error) {
		throw new Error(`SABnzbd error: ${data.error}`);
	}

	return data;
}

// === Helper functions ===

function getStatusLabel(status: number | undefined): string {
	if (!status) return "unknown";
	return MediaStatusLabels[status] || "unknown";
}

function extractYear(dateStr: string | null | undefined): string | null {
	if (!dateStr) return null;
	return dateStr.slice(0, 4);
}

// === Exported functions ===

export async function searchMedia(query: string, page = 1): Promise<SearchResponseType> {
	log.info({ query, page }, "Searching media");
	return jellyseerrFetch<SearchResponseType>(`/search?query=${encodeURIComponent(query)}&page=${page}`);
}

export async function getTvDetails(tmdbId: number): Promise<TvDetailsResponseType> {
	log.info({ tmdbId }, "Getting TV details");
	return jellyseerrFetch<TvDetailsResponseType>(`/tv/${tmdbId}`);
}

export async function getMovieDetails(tmdbId: number): Promise<MovieDetailsResponseType> {
	log.info({ tmdbId }, "Getting movie details");
	return jellyseerrFetch<MovieDetailsResponseType>(`/movie/${tmdbId}`);
}

export async function requestMedia(body: MediaRequestBodyType): Promise<MediaRequestResponseType> {
	log.info({ mediaId: body.mediaId, mediaType: body.mediaType, seasons: body.seasons }, "Requesting media");
	return jellyseerrFetch<MediaRequestResponseType>("/request", {
		method: "POST",
		body,
	});
}

// === AI Tool-exposed functions ===

export const searchMediaTool = withTool(
	{
		name: "search_media",
		description: `Search the media library for movies and TV shows.

Use this for ANY media question:
- "Do you have Batman?"
- "Is Breaking Bad available?"
- "Has Barry finished downloading?"
- "Search for Star Wars"

IMPORTANT: Search by TITLE ONLY. Do not include season numbers, episode numbers, or years in the query.
- User asks "do we have season 1 of Barry?" → search for "Barry" (not "Barry season 1")
- User asks "is Breaking Bad S03 downloaded?" → search for "Breaking Bad"

The status field tells you everything:
- "available" = fully downloaded, ready to watch
- "partially available" = some content downloaded (e.g., some seasons)
- "processing" = currently downloading
- "pending" = requested, waiting to download
- "unknown" = not in library, not requested

You do NOT need to call any other tool after this - the status in results is authoritative.`,
		input: z.object({
			query: z.string().describe("Movie or TV show title (no season/episode numbers)"),
		}),
	},
	async ({ query }) => {
		try {
			const response = await searchMedia(query);

			// Filter to movies and TV shows only, limit results
			const mediaResults = response.results
				.filter((r) => r.mediaType === "movie" || r.mediaType === "tv")
				.slice(0, 10)
				.map((result) => {
					const isMovie = result.mediaType === "movie";
					const title = isMovie ? result.title : result.name;
					const year = extractYear(isMovie ? result.releaseDate : result.firstAirDate);
					const status = getStatusLabel(result.mediaInfo?.status);

					return {
						type: result.mediaType,
						id: result.id,
						title: title || "Unknown",
						year,
						status,
						overview: result.overview?.slice(0, 200),
					};
				});

			return {
				success: true,
				query,
				totalResults: response.totalResults,
				results: mediaResults,
			};
		} catch (error) {
			log.error({ error, query }, "Failed to search media");
			return {
				success: false,
				query,
				totalResults: 0,
				results: [],
				error: error instanceof Error ? error.message : "Failed to search media",
			};
		}
	}
);

// === SABnzbd Exported functions ===

export async function getDownloadQueue(): Promise<SabnzbdQueueResponseType> {
	log.info("Getting SABnzbd download queue");
	const response = await sabnzbdFetch<{ queue: SabnzbdQueueResponseType }>("queue");
	return response.queue;
}

export async function getDownloadHistory(limit = 10): Promise<SabnzbdHistoryResponseType> {
	log.info({ limit }, "Getting SABnzbd download history");
	const response = await sabnzbdFetch<{ history: SabnzbdHistoryResponseType }>("history", { limit: limit.toString() });
	return response.history;
}

export async function pauseDownloads(): Promise<boolean> {
	log.info("Pausing SABnzbd downloads");
	const response = await sabnzbdFetch<{ status: boolean }>("pause");
	return response.status;
}

export async function resumeDownloads(): Promise<boolean> {
	log.info("Resuming SABnzbd downloads");
	const response = await sabnzbdFetch<{ status: boolean }>("resume");
	return response.status;
}

// === SABnzbd AI Tool-exposed functions ===

export const getDownloadQueueTool = withTool(
	{
		name: "get_download_queue",
		description: `Get the current download queue from SABnzbd.

Use this to answer questions like:
- "What's downloading right now?"
- "How long until Barry is done?"
- "What's the download speed?"
- "Is anything stuck?"

Returns:
- Queue status (Downloading, Paused, Idle)
- Current speed and time remaining
- List of items with progress percentage and ETA
- Disk space available

This is read-only - use pause_downloads/resume_downloads to control the queue.`,
		input: z.object({}),
	},
	async () => {
		try {
			const queue = await getDownloadQueue();

			// Format items for readability
			const items = queue.slots.map((slot) => ({
				name: slot.filename,
				status: slot.status,
				progress: `${slot.percentage}%`,
				eta: slot.timeleft,
				size: `${slot.mbleft}MB / ${slot.mb}MB remaining`,
				category: slot.cat,
			}));

			return {
				success: true,
				status: queue.status,
				paused: queue.paused,
				speed: queue.speed,
				totalTimeLeft: queue.timeleft,
				queueSize: `${queue.mbleft}MB / ${queue.mb}MB`,
				itemCount: queue.noofslots_total,
				diskSpace: `${queue.diskspace1}GB free`,
				items,
			};
		} catch (error) {
			log.error({ error }, "Failed to get download queue");
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to get download queue",
			};
		}
	}
);

export const getDownloadHistoryTool = withTool(
	{
		name: "get_download_history",
		description: `Get recent download history from SABnzbd.

Use this to answer questions like:
- "What finished downloading today?"
- "Did that movie complete?"
- "Show me recent downloads"
- "Any failed downloads?"

Returns completed and failed downloads with timestamps.`,
		input: z.object({
			limit: z.number().min(1).max(50).optional().describe("Number of history items (default 10, max 50)"),
		}),
	},
	async ({ limit }) => {
		try {
			const history = await getDownloadHistory(limit ?? 10);

			const items = history.slots.map((slot) => ({
				name: slot.name,
				status: slot.status,
				category: slot.category,
				size: `${Math.round(slot.bytes / 1024 / 1024)}MB`,
				completed: new Date(slot.completed * 1000).toLocaleString(),
				failMessage: slot.fail_message || undefined,
			}));

			return {
				success: true,
				stats: {
					today: history.day_size,
					thisWeek: history.week_size,
					thisMonth: history.month_size,
					total: history.total_size,
				},
				itemCount: history.noofslots,
				items,
			};
		} catch (error) {
			log.error({ error }, "Failed to get download history");
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to get download history",
			};
		}
	}
);

export const pauseDownloadsTool = withTool(
	{
		name: "pause_downloads",
		description: `Pause all downloads in SABnzbd.

Use this when:
- User needs bandwidth for gaming/streaming
- System resources are needed elsewhere
- User explicitly asks to pause

This is reversible - use resume_downloads to continue.`,
		input: z.object({}),
	},
	async () => {
		try {
			await pauseDownloads();
			return {
				success: true,
				message: "Downloads paused. Use resume_downloads to continue.",
			};
		} catch (error) {
			log.error({ error }, "Failed to pause downloads");
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to pause downloads",
			};
		}
	}
);

export const resumeDownloadsTool = withTool(
	{
		name: "resume_downloads",
		description: `Resume paused downloads in SABnzbd.

Use this to continue downloading after a pause.`,
		input: z.object({}),
	},
	async () => {
		try {
			await resumeDownloads();
			return {
				success: true,
				message: "Downloads resumed.",
			};
		} catch (error) {
			log.error({ error }, "Failed to resume downloads");
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to resume downloads",
			};
		}
	}
);

export const requestMovieTool = withTool(
	{
		name: "request_movie",
		description: `Request a movie to be downloaded via Jellyseerr.

Use this when:
- User asks to download/add a specific movie
- User wants a movie that's not available yet
- After searching and confirming which movie they want

IMPORTANT: You must first search for the movie using search_media to get its TMDB ID.

Example workflow:
1. User: "Can you download The Batman?"
2. Call search_media("The Batman")
3. Confirm which result matches (e.g., "The Batman (2022)")
4. Call request_movie with the tmdbId from search results

Parameters:
- tmdbId: The TMDB ID from search_media results
- is4k: Optional, request 4K version (default false)`,
		input: z.object({
			tmdbId: z.number().describe("The TMDB ID from search_media results"),
			is4k: z.boolean().optional().describe("Request 4K version (default false)"),
		}),
	},
	async ({ tmdbId, is4k }) => {
		try {
			const result = await requestMedia({
				mediaId: tmdbId,
				mediaType: "movie",
				is4k: is4k ?? false,
			});

			return {
				success: true,
				message: "Movie request submitted successfully",
				requestId: result.id,
				status: getStatusLabel(result.media.status),
				tmdbId: result.media.tmdbId,
			};
		} catch (error) {
			log.error({ error, tmdbId }, "Failed to request movie");
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to request movie",
			};
		}
	}
);

export const requestTvShowTool = withTool(
	{
		name: "request_tv_show",
		description: `Request a TV show (or specific seasons) to be downloaded via Jellyseerr.

Use this when:
- User asks to download/add a TV show
- User wants specific seasons of a show
- After searching and confirming which show they want

IMPORTANT: You must first search for the show using search_media to get its TMDB ID.

Example workflow:
1. User: "Can you download Breaking Bad season 1?"
2. Call search_media("Breaking Bad")
3. Confirm which result matches
4. Call request_tv_show with tmdbId and seasons: [1]

Parameters:
- tmdbId: The TMDB ID from search_media results
- seasons: Optional array of season numbers to request (e.g., [1, 2, 3]). If not specified, requests all seasons.
- is4k: Optional, request 4K version (default false)`,
		input: z.object({
			tmdbId: z.number().describe("The TMDB ID from search_media results"),
			seasons: z.array(z.number()).optional().describe("Season numbers to request (e.g., [1, 2]). Omit to request all seasons."),
			is4k: z.boolean().optional().describe("Request 4K version (default false)"),
		}),
	},
	async ({ tmdbId, seasons, is4k }) => {
		try {
			const result = await requestMedia({
				mediaId: tmdbId,
				mediaType: "tv",
				seasons,
				is4k: is4k ?? false,
			});

			return {
				success: true,
				message: seasons
					? `TV show request submitted for season${seasons.length > 1 ? "s" : ""} ${seasons.join(", ")}`
					: "TV show request submitted for all seasons",
				requestId: result.id,
				status: getStatusLabel(result.media.status),
				tmdbId: result.media.tmdbId,
				requestedSeasons: seasons,
			};
		} catch (error) {
			log.error({ error, tmdbId, seasons }, "Failed to request TV show");
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to request TV show",
			};
		}
	}
);

// Export tools array for agent
export const mediaTools = [
	searchMediaTool.tool,
	requestMovieTool.tool,
	requestTvShowTool.tool,
	getDownloadQueueTool.tool,
	getDownloadHistoryTool.tool,
	pauseDownloadsTool.tool,
	resumeDownloadsTool.tool,
];
