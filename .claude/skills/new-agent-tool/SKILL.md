---
name: new-agent-tool
description: Add a new tool to the Nexus AI agent (The Machine). Creates the tool definition, wires it into the agent, updates the system prompt, and registers it in the tool registry. Use when the agent requests a new capability or when manually adding tools.
---

# New Agent Tool

Add a new tool to The Machine (Nexus AI agent) following established patterns.

## What this skill does

When invoked, walk through these steps:

### 1. Gather information

Ask the user (or infer from issue context) for:
- **Tool name** — snake_case (e.g., `search_tempo_traces`, `get_git_history`)
- **Domain** — Which domain module it belongs to. Either an existing one or a new one:
  - Existing: `ops`, `game-servers`, `media`, `system-info`, `apps`, `loki`
  - New: Creates a new domain directory
- **Description** — What the tool does (one sentence)
- **Parameters** — Input schema fields with types and descriptions
- **External dependencies** — Any new config values, API endpoints, or packages needed

### 2. Create or update the domain module

Tools live in `nexus/packages/core/src/domains/<domain>/functions.ts`.

#### If adding to an existing domain

Add the tool definition to the existing `functions.ts` and append it to the domain's exported tools array.

#### If creating a new domain

Create `nexus/packages/core/src/domains/<domain>/`:

**`functions.ts`** — Tool definitions:
```typescript
import logger from "@nexus/logger";
import { z } from "zod";
import { config } from "../../infra/config";
import { toolDefinition } from "@tanstack/ai";

const log = logger.child({ module: "<domain>" });

// === Internal helpers ===

// Any helper functions for API calls, data processing, etc.

// === Tool definitions ===

export const myNewTool = toolDefinition({
  name: "<tool_name>",
  description: `<detailed description for the LLM>

Use cases:
- <example use case 1>
- <example use case 2>

<parameter docs if complex>`,
  inputSchema: z.object({
    // Parameters with .describe() for each
    query: z.string().describe("What to search for"),
    namespace: z.string().optional().describe("K8s namespace filter"),
  }),
}).server(async ({ query, namespace }) => {
  // Implementation
  log.info({ query, namespace }, "Tool invoked");

  try {
    // Do the work
    const result = await someApiCall(query);
    return {
      success: true,
      // Return structured data the LLM can reason about
      results: result,
      resultCount: result.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err }, "Tool failed");
    return {
      success: false,
      error: message,
    };
  }
});

export const <domain>Tools = [myNewTool];
```

**`index.ts`** — Re-exports:
```typescript
export * from "./functions";
```

### 3. Wire into the agent

Update `nexus/packages/core/src/domains/agent/functions.ts`:

**Import the tools:**
```typescript
import { <domain>Tools } from "../<domain>/functions";
```

**Add to getAllDomainTools:**
```typescript
export function getAllDomainTools(thread: AgentThread) {
  const metaTools = createMetaTools(thread);
  return [
    ...gameServerTools,
    ...systemInfoTools,
    ...appTools,
    ...opsTools,
    ...mediaTools,
    ...lokiTools,
    ...<domain>Tools,  // Add here
    ...metaTools,
  ];
}
```

### 4. Update the system prompt

In the same `functions.ts`, update `AGENT_SYSTEM_PROMPT`:

**Add capability bullet point** in the "Your Capabilities" section:
```
- <Brief description of what the tool does>
```

**Add usage section** (if the tool has non-obvious usage patterns):
```
## Using <Tool Name>

Use **<tool_name>(params)** for <use case summary>:

- "<user question>" -> <tool_name>({ param: "value" })
- "<user question>" -> <tool_name>({ param: "value" })

<any important notes about parameters or behavior>
```

Place new usage sections after existing ones (before "Escalating to Code Changes").

### 5. Update the tool registry

Add the tool to `nexus/packages/core/src/infra/tool-registry.ts`:

```typescript
{
  name: "<tool_name>",
  description: "<short description for dashboard UI>",
  category: "<Category>",  // e.g., "Observability", "Operations", "Game Servers"
  parameters: {
    paramName: { type: "string", description: "...", required: true },
    optionalParam: { type: "string", description: "...", required: false },
  },
},
```

Place it in the appropriate category section, or create a new category comment block if needed.

### 6. Add config values (if needed)

If the tool calls an external API, add the URL/key to `nexus/packages/core/src/infra/config.ts`:

```typescript
// <Service Name>
SERVICE_URL: Bun.env.SERVICE_URL || "http://<service>.<namespace>.svc.cluster.local:<port>",
SERVICE_API_KEY: Bun.env.SERVICE_API_KEY,
```

Use in-cluster service DNS as the default. Never hardcode secrets.

### 7. Verify

Run these checks from `nexus/`:

```bash
bun run typecheck    # Must pass
bun run check        # Must pass (Biome lint)
```

### 8. Summary

After creating all files, output:
- Files created/modified
- New tool name and what it does
- Any environment variables that need to be set
- Any secrets that need to be added to Infisical

## Key conventions

- **Schema library**: Always use `zod` (z.*) for tool input schemas — tools use `@tanstack/ai` toolDefinition which requires zod
- **Logging**: Always create a child logger: `logger.child({ module: "<domain>" })`
- **Error handling**: Return `{ success: false, error: message }` — never throw from tool handlers
- **Return values**: Return structured data the LLM can reason about, not raw API responses
- **Timeouts**: Use `AbortSignal.timeout(30_000)` for external API calls
- **Kubernetes access**: Use `executeKubectl()` / `executeSSH()` from `../../infra/ssh` — never direct K8s client calls from tools
- **Config**: Use `config.<KEY>` from `../../infra/config` — never read env vars directly in tools
- **Naming**: Tool names are snake_case, domain directories are kebab-case
- **Descriptions**: Tool descriptions should be detailed enough for the LLM to know when to use the tool — include use cases and parameter examples

## Example: Loki log search tool

Reference implementation: `nexus/packages/core/src/domains/loki/functions.ts`

This tool demonstrates:
- Query builder pattern (simple input -> complex query language)
- Time parsing helpers (relative "1h ago" -> nanosecond timestamps)
- Structured API response types
- Result flattening and formatting for LLM consumption
- Proper error handling with informative messages
