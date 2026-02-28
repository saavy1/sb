# Handoff: TanStack AI Native `toolDefinition` Migration

## What Changed

### Core: Drop `withTool`, use `toolDefinition().server()` from `@tanstack/ai`

The custom `withTool` abstraction in `infra/tools.ts` has been replaced by `@tanstack/ai`'s native `toolDefinition` API. The APIs were nearly identical — the main differences:

| Before (`withTool`) | After (`toolDefinition`) |
|---|---|
| `withTool({ name, description, input: z.* }, async (args) => ...)` | `toolDefinition({ name, description, inputSchema: z.* }).server(async (args) => ...)` |
| `runWithToolContext(threadId, fn, { model })` | Direct `chat()` / `streamToText()` calls |
| Export `myTool.tool` in tool arrays | Export `myTool` directly |

**Files transformed (54 tools total):**
- `packages/core/src/domains/game-servers/functions.ts` — 9 tools
- `packages/core/src/domains/system-info/functions.ts` — 9 tools
- `packages/core/src/domains/ops/functions.ts` — 19 tools
- `packages/core/src/domains/media/functions.ts` — 7 tools
- `packages/core/src/domains/apps/functions.ts` — 4 tools
- `packages/core/src/domains/agent/functions.ts` — 6 meta-tools

**Deleted:**
- `packages/core/src/infra/tools.ts` — entire file (`withTool`, `collectTools`, `runWithToolContext`, `toolContextStorage`, `summarizeResult`)
- Removed re-export from `packages/core/src/infra/index.ts`

### Core: Remove `runWithToolContext` AsyncLocalStorage

`runWithToolContext` used `AsyncLocalStorage` to pass thread context into tool execution for logging. This was only consumed by `withTool` internals. With `withTool` gone, the entire mechanism is removed.

**Unwrapped in:**
- `packages/core/src/domains/agent/functions.ts` — `runAgentLoop()` now calls `chat()` / `streamToText()` directly
- `packages/core/src/domains/agent/routes.ts` — chat streaming endpoint now calls `chat()` directly

### Core: Agent/Chat streaming refactor

- `packages/core/src/domains/agent/routes.ts` — chat endpoint uses `chat()` from `@tanstack/ai` with `toServerSentEventsResponse()` for SSE streaming, plus a `withPersistence` async generator that collects messages during streaming and persists to DB on completion
- `packages/core/src/domains/agent/types.ts` — simplified message types to align with TanStack AI's message format
- `packages/core/src/infra/ai.ts` — simplified adapter setup

### UI: Chat components refactored for streaming

- `ChatView.tsx` — simplified to consume SSE stream chunks directly
- `ChatMessage.tsx` — updated message rendering for new format
- `ChatMessages.tsx` — updated list rendering
- `ToolCallIndicator.tsx` / `ToolResultBlock.tsx` / `ToolErrorBlock.tsx` — updated for new tool call format
- **Deleted** `message-parser.ts` — no longer needed, parsing handled inline

### Dependencies

- Added `@standard-schema/spec` as devDependency to `packages/core` — required for type inference from Zod v4 schemas in `toolDefinition`. Without it, all tool handler args resolve to `unknown`.

## Verification

- `bun run typecheck` — passes clean across all 9 packages
- `bun run check` — passes (pre-existing UI lint warnings about array index keys, unrelated)

## How to Push & PR

From the worktree directory:

```bash
git push -u origin worktree-tanstack-ai
```

Then:

```bash
gh pr create --title "migrate to @tanstack/ai native toolDefinition API" --body "$(cat <<'EOF'
## Summary
- Drop custom `withTool` abstraction and `runWithToolContext` AsyncLocalStorage in favor of `toolDefinition().server()` from `@tanstack/ai` — all 54 tools across 6 domains
- Delete `infra/tools.ts` entirely
- Refactor chat UI components for TanStack AI streaming protocol
- Add `withPersistence` async generator for server-side message persistence during streaming

## Test plan
- [ ] `bun run typecheck` passes
- [ ] Chat streaming works end-to-end
- [ ] Tool calls execute correctly through agent loop

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

## Future Work (discussed, not implemented)

- **Drop Qdrant/embeddings** — remove Qdrant vector DB, embeddings worker, and OpenAI embeddings API entirely. If memory search is needed later, revisit.
- **SpacetimeDB exploration** — potential Postgres replacement for real-time subscriptions and reducer-based CRUD. Business logic stays in nexus API/core, only DB operations would shift to SpacetimeDB reducers.
