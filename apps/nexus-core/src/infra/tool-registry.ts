/**
 * Tool registry for exposing available tools to the dashboard.
 * This provides metadata about all tools available to the agent.
 */

export interface ToolInfo {
	name: string;
	description: string;
	category: string;
	parameters?: Record<string, { type: string; description?: string; required?: boolean }>;
}

// Static registry of all tools with their metadata
// This is manually maintained to ensure accurate descriptions for the UI
export const toolRegistry: ToolInfo[] = [
	// Game Server Tools
	{
		name: "list_game_servers",
		description: "List all game servers with their current status",
		category: "Game Servers",
	},
	{
		name: "get_server",
		description: "Get details about a specific game server by name",
		category: "Game Servers",
		parameters: {
			name: { type: "string", description: "The server name", required: true },
		},
	},
	{
		name: "start_server",
		description: "Start a game server by name",
		category: "Game Servers",
		parameters: {
			name: { type: "string", description: "The server name to start", required: true },
		},
	},
	{
		name: "stop_server",
		description: "Stop a game server by name",
		category: "Game Servers",
		parameters: {
			name: { type: "string", description: "The server name to stop", required: true },
		},
	},
	{
		name: "create_server",
		description: "Create a new Minecraft game server with a modpack",
		category: "Game Servers",
		parameters: {
			name: { type: "string", description: "Server name (lowercase, alphanumeric, hyphens)", required: true },
			modpack: { type: "string", description: "CurseForge modpack slug or ID", required: true },
			memory: { type: "string", description: "Memory allocation (e.g., '8G')", required: false },
		},
	},
	{
		name: "delete_server",
		description: "Delete a game server and all its resources (destructive)",
		category: "Game Servers",
		parameters: {
			name: { type: "string", description: "The server name to delete", required: true },
		},
	},
	{
		name: "query_minecraft_status",
		description: "Query live Minecraft server status including player count, version, and MOTD",
		category: "Game Servers",
	},
	{
		name: "get_player_count",
		description: "Get the current player count on the Minecraft server",
		category: "Game Servers",
	},
	{
		name: "list_game_server_pods",
		description: "List Kubernetes pods for game servers with health and restart info",
		category: "Game Servers",
	},

	// System Info Tools
	{
		name: "get_system_stats",
		description: "Get current system stats (CPU, memory, GPU, disk, network)",
		category: "System Info",
	},
	{
		name: "get_drives",
		description: "Get registered storage drives and their usage",
		category: "System Info",
	},
	{
		name: "get_databases",
		description: "Get database sizes and row counts",
		category: "System Info",
	},

	// Apps Tools
	{
		name: "list_apps",
		description: "List all registered apps/services with their URLs and status",
		category: "Apps",
	},
	{
		name: "get_app",
		description: "Get details about a specific app by name or ID",
		category: "Apps",
		parameters: {
			nameOrId: { type: "string", description: "App name or ID", required: true },
		},
	},
	{
		name: "add_app",
		description: "Register a new app/service in the dashboard",
		category: "Apps",
		parameters: {
			name: { type: "string", description: "App display name", required: true },
			url: { type: "string", description: "App URL", required: true },
			category: { type: "string", description: "Category (media, tools, monitoring, etc.)", required: false },
		},
	},
	{
		name: "remove_app",
		description: "Remove an app from the dashboard",
		category: "Apps",
		parameters: {
			nameOrId: { type: "string", description: "App name or ID to remove", required: true },
		},
	},

	// Ops Tools
	{
		name: "trigger_nixos_rebuild",
		description: "Trigger a NixOS rebuild on the server (switch configuration)",
		category: "Operations",
	},
	{
		name: "trigger_flux_reconcile",
		description: "Trigger Flux GitOps reconciliation for Kubernetes",
		category: "Operations",
	},
	{
		name: "get_operation_status",
		description: "Get the status of a running or recent operation",
		category: "Operations",
		parameters: {
			operationId: { type: "string", description: "Operation ID", required: true },
		},
	},
	{
		name: "list_operations",
		description: "List recent infrastructure operations",
		category: "Operations",
	},

	// Agent Lifecycle Tools (meta-tools)
	{
		name: "schedule_wake",
		description: "Schedule the agent to wake up later to check on something",
		category: "Agent Lifecycle",
		parameters: {
			delay: { type: "string", description: "Time to wait (e.g., '10s', '5m', '2h')", required: true },
			reason: { type: "string", description: "What to check/do when waking", required: true },
		},
	},
	{
		name: "complete_task",
		description: "Mark the current task as complete",
		category: "Agent Lifecycle",
		parameters: {
			summary: { type: "string", description: "Brief description of what was accomplished", required: true },
		},
	},
	{
		name: "store_context",
		description: "Store information for later (persists across sleep/wake)",
		category: "Agent Lifecycle",
		parameters: {
			key: { type: "string", description: "String identifier for the data", required: true },
			value: { type: "any", description: "Any JSON-serializable value", required: true },
		},
	},
	{
		name: "get_context",
		description: "Retrieve previously stored context data",
		category: "Agent Lifecycle",
		parameters: {
			key: { type: "string", description: "The key used when storing", required: true },
		},
	},
	{
		name: "send_notification",
		description: "Send a Discord notification to alert the user",
		category: "Agent Lifecycle",
		parameters: {
			message: { type: "string", description: "The notification text", required: true },
		},
	},
	{
		name: "search_history",
		description: "Search past conversations for relevant context using semantic search",
		category: "Agent Lifecycle",
		parameters: {
			query: { type: "string", description: "Natural language search query", required: true },
			limit: { type: "number", description: "Max results (1-10, default 5)", required: false },
		},
	},
];

/**
 * Get all tools grouped by category.
 */
export function getToolsByCategory(): Record<string, ToolInfo[]> {
	const grouped: Record<string, ToolInfo[]> = {};
	for (const tool of toolRegistry) {
		if (!grouped[tool.category]) {
			grouped[tool.category] = [];
		}
		grouped[tool.category].push(tool);
	}
	return grouped;
}

/**
 * Get tool count summary.
 */
export function getToolSummary(): { total: number; byCategory: Record<string, number> } {
	const byCategory: Record<string, number> = {};
	for (const tool of toolRegistry) {
		byCategory[tool.category] = (byCategory[tool.category] || 0) + 1;
	}
	return { total: toolRegistry.length, byCategory };
}
