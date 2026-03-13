import logger from "@nexus/logger";
import { FalkorDB, type Graph } from "falkordb";
import { config } from "./config";

const log = logger.child({ module: "graph" });

const GRAPH_NAME = "agent_memory";

let db: FalkorDB | null = null;
let graph: Graph | null = null;

/**
 * Lazily connect to FalkorDB and return the agent_memory graph.
 * Reuses the same connection across calls.
 */
export async function getGraph(): Promise<Graph> {
	if (graph && db) return graph;

	// FalkorDB uses falkor:// scheme but accepts the same format as redis://
	const url = config.FALKORDB_URL.replace(/^redis:\/\//, "falkor://");

	db = await FalkorDB.connect({ url });
	graph = db.selectGraph(GRAPH_NAME);

	log.info({ url: config.FALKORDB_URL, graph: GRAPH_NAME }, "Connected to FalkorDB");

	return graph;
}

/**
 * Check if FalkorDB is reachable.
 */
export async function checkGraphHealth(): Promise<boolean> {
	try {
		const g = await getGraph();
		await g.query("RETURN 1");
		return true;
	} catch {
		return false;
	}
}

/**
 * Close the FalkorDB connection gracefully.
 */
export async function closeGraph(): Promise<void> {
	if (db) {
		await db.close();
		db = null;
		graph = null;
		log.info("FalkorDB connection closed");
	}
}
