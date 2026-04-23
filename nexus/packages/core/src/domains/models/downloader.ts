/**
 * HuggingFace weights downloader.
 *
 * Runs inside the agent-worker pod (which has /tank/models mounted as a
 * hostPath). Uses the official @huggingface/hub TS SDK to list + stream each
 * repo file into the target directory, emitting live progress events via
 * appEvents so the UI can show a progress bar.
 *
 * Supersedes the previous K8s batch Job approach — no Job pod spawn, no pip
 * install, no CLI version drift, and real-time progress for the UI.
 */

import { createWriteStream } from "node:fs";
import { mkdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { downloadFile, listFiles } from "@huggingface/hub";
import logger from "@nexus/logger";
import { appEvents } from "../../infra/events";
import type { Model } from "./schema";

const log = logger.child({ module: "models.downloader" });

const MODELS_DIR = process.env.KSERVE_MODELS_DIR || "/tank/models";
const HF_TOKEN = process.env.HF_TOKEN;

// How often (ms) to emit a progress event while bytes are streaming. Higher
// values reduce WebSocket chatter; lower values feel more responsive.
const PROGRESS_THROTTLE_MS = 500;

export type DownloadPhase = "listing" | "downloading" | "complete" | "error";

export interface FileEntry {
	path: string;
	size: number;
}

function emitProgress(
	name: string,
	phase: DownloadPhase,
	extras: {
		filesTotal?: number;
		filesDone?: number;
		bytesTotal?: number;
		bytesDone?: number;
		currentFile?: string;
		error?: string;
	} = {}
): void {
	appEvents.emit("model:download-progress", { name, phase, ...extras });
}

/**
 * Download the entire HuggingFace repo to /tank/models/<slug>/.
 *
 * Files already present on disk with matching size are skipped (crude but
 * adequate resumption — HF files are content-addressed so size equality is a
 * very strong signal). In-flight files are staged to `<path>.part` and moved
 * into place only on complete success.
 */
export async function downloadModelWeights(
	model: Pick<Model, "name" | "hfRepoId" | "hfRevision">,
	opts: { signal?: AbortSignal } = {}
): Promise<void> {
	const dest = path.join(MODELS_DIR, model.name);
	await mkdir(dest, { recursive: true });

	const repo = { type: "model" as const, name: model.hfRepoId };
	const revision = model.hfRevision ?? undefined;
	const accessToken = HF_TOKEN;

	// Phase 1: enumerate files + compute total size.
	emitProgress(model.name, "listing");
	const entries: FileEntry[] = [];
	for await (const f of listFiles({ repo, revision, accessToken, recursive: true })) {
		if (f.type !== "file") continue;
		entries.push({ path: f.path, size: Number(f.size ?? 0) });
	}

	const bytesTotal = entries.reduce((s, e) => s + e.size, 0);
	log.info(
		{ name: model.name, repo: model.hfRepoId, files: entries.length, bytesTotal },
		"discovered files"
	);

	// Phase 2: download each file, streaming to disk with progress throttling.
	let filesDone = 0;
	let bytesDone = 0;
	let lastEmit = 0;

	const maybeEmit = (currentFile: string, phase: DownloadPhase = "downloading") => {
		const now = Date.now();
		if (now - lastEmit > PROGRESS_THROTTLE_MS) {
			lastEmit = now;
			emitProgress(model.name, phase, {
				filesTotal: entries.length,
				filesDone,
				bytesTotal,
				bytesDone,
				currentFile,
			});
		}
	};

	for (const entry of entries) {
		if (opts.signal?.aborted) throw new Error("download aborted");

		const target = path.join(dest, entry.path);
		await mkdir(path.dirname(target), { recursive: true });

		// Skip if we already have a byte-identical file on disk. Good enough
		// for resumption across worker restarts; HF file sizes are stable.
		const existing = await stat(target).catch(() => null);
		if (existing && entry.size > 0 && existing.size === entry.size) {
			filesDone++;
			bytesDone += entry.size;
			log.debug({ file: entry.path }, "skipping (matches existing size)");
			continue;
		}

		const tmp = `${target}.part`;
		emitProgress(model.name, "downloading", {
			filesTotal: entries.length,
			filesDone,
			bytesTotal,
			bytesDone,
			currentFile: entry.path,
		});

		try {
			// @huggingface/hub returns Blob | null. Null = file missing at the
			// given revision (shouldn't happen since we just enumerated the
			// tree, but guard anyway). Other transport failures throw.
			const blob = await downloadFile({ repo, path: entry.path, revision, accessToken });
			if (!blob) {
				throw new Error(`HF file ${entry.path} returned null (missing or forbidden)`);
			}

			// Cast through `unknown`: DOM's ReadableStream<Uint8Array<ArrayBuffer>>
			// and node:stream/web's ReadableStream<Uint8Array<ArrayBufferLike>> are
			// structurally compatible at runtime but TS treats them as distinct.
			const nodeReadable = Readable.fromWeb(
				blob.stream() as unknown as WebReadableStream<Uint8Array>
			);
			nodeReadable.on("data", (chunk: Buffer) => {
				bytesDone += chunk.length;
				maybeEmit(entry.path);
			});

			await pipeline(nodeReadable, createWriteStream(tmp));
			await rename(tmp, target);
			filesDone++;
		} catch (err) {
			// Clean up any partial `.part` file so resumption starts fresh.
			await unlink(tmp).catch(() => undefined);
			throw err;
		}
	}

	emitProgress(model.name, "complete", {
		filesTotal: entries.length,
		filesDone,
		bytesTotal,
		bytesDone,
	});
	log.info(
		{ name: model.name, repo: model.hfRepoId, files: entries.length, bytesTotal },
		"download complete"
	);
}
