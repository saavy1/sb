# Claude Code Guide

Development patterns and conventions for the Superbloom monorepo.

## Type System

**Never use `type` or `interface` directly.** Use schema-first definitions:

| Location | Schema Library | Example |
|----------|---------------|---------|
| Server-side (Nexus) | Elysia `t.*` | `t.Object({ id: t.String() })` |
| Client-only | Zod | `z.object({ id: z.string() })` |

### Server Types (Elysia)

Define schemas in `types.ts`, derive TypeScript types with `.static`:

```typescript
// apps/nexus/src/domains/chat/types.ts
import { t } from "elysia";

export const MessagePartSchema = t.Object({
  type: t.String(),
  content: t.Optional(t.String()),
});

// Derive TS type from schema
export type MessagePartType = typeof MessagePartSchema.static;
```

### Why Elysia `t.*`?

- Runtime validation on API boundaries
- Auto-generated OpenAPI docs
- Single source of truth (no schema/type drift)
- Eden Treaty infers types for clients automatically

### Client Types

Dashboard and The Machine **never define their own types** for API data. They import from Nexus via Eden Treaty:

```typescript
// CORRECT - types flow from Nexus
import type { App } from "@nexus/app";
const client = treaty<App>(API_URL);
const { data } = await client.api.servers.get();
// data is fully typed from Nexus schemas

// WRONG - never duplicate types
interface Server { name: string; } // Don't do this
```

For client-only concerns (form state, UI state), use Zod:

```typescript
// Client-only validation
const FormSchema = z.object({
  search: z.string().min(1),
});
```

## Domain Structure

Each domain in `apps/nexus-core/src/domains/<name>/`:

```
├── schema.ts      # Drizzle table definitions
├── types.ts       # Elysia t.* schemas + derived types
├── functions.ts   # Business logic
├── repository.ts  # Database queries (optional)
├── routes.ts      # Elysia route handlers
├── index.ts       # Re-exports all from the domain
└── k8s-adapter.ts # K8s integration (if needed)
```

**nexus** is the thin API layer that composes routes from nexus-core:
- `apps/nexus/src/app.ts` - Elysia app composition
- `apps/nexus/src/routes/` - Route groups (private, public, webhooks)
- `apps/nexus/src/middleware/` - Auth middlewares

### Type Flow Example

```
types.ts (MessagePartSchema)
    ↓
service.ts (uses MessagePartType)
    ↓
routes.ts (validates with MessagePartSchema, returns typed responses)
    ↓
Eden Treaty (infers types for Dashboard/The Machine)
```

## Real-time Events

WebSocket events via `/api/events`:

**Backend** - Emit events from anywhere:
```typescript
import { appEvents } from "@nexus-core/infra/events";
appEvents.emit("conversation:updated", { id, title });
```

**Frontend** - Subscribe with hook:
```typescript
import { useEvents } from "../lib/useEvents";
useEvents("conversation:updated", (payload) => {
  // payload is typed
});
```

Event types defined in `apps/nexus-core/src/infra/events.ts`.

## Common Patterns

### Extracting Content from TanStack AI Messages

Messages may have `content` string or `parts` array:

```typescript
function extractTextContent(message: {
  content?: string | null;
  parts?: MessagePartType[] | null;
}): string {
  if (message.content) return message.content;
  if (message.parts) {
    return message.parts
      .filter((p) => p.type === "text")
      .map((p) => p.content || p.text || "")
      .filter(Boolean)
      .join("\n");
  }
  return "";
}
```

### API Validation Schemas

Reuse domain schemas in route validation:

```typescript
// routes.ts
import { MessagePartSchema } from "./types";

.post("/messages", handler, {
  body: t.Object({
    role: t.String(),
    parts: t.Optional(t.Array(MessagePartSchema)), // Reuse!
  }),
})
```

## Commands

**All commands run from `sb/apps/` workspace root:**

```bash
# Development
bun run dev:api        # Nexus on :3000
bun run dev:dashboard  # Dashboard on :3001

# Quality checks (runs on all packages via --filter '*')
bun run typecheck      # TypeScript check all packages
bun run lint           # Biome lint all packages
bun run check          # Biome check all packages

# Drizzle migrations (from nexus-core directory)
bun --cwd nexus-core run db:generate      # Generate all migrations
bun --cwd nexus-core run db:generate:agent  # Generate agent schema migration
bun --cwd nexus-core run db:migrate       # Run migrations
```

**Note:** Use `bash -c 'cd /path/to/apps && bun run <script>'` if `cd` is aliased (e.g., zoxide).

## Shell Tools

| Tool | Purpose | Example |
|------|---------|---------|
| `rg` (ripgrep) | Fast text search | `rg "pattern" --type ts` |
| `fd` | Fast file finder | `fd "schema" --extension ts` |
| `fzf` | Fuzzy finder | `fd \| fzf` |
| `eza` | Better ls | `eza --tree --level=2 apps/` |

### Useful Searches

```bash
# Find all route definitions
rg "new Elysia" apps/nexus-core/src

# Find all Drizzle schemas
fd schema.ts apps/nexus-core

# Find all API endpoints
rg "\.get\(|\.post\(|\.patch\(|\.delete\(" apps/nexus-core/src/domains

# Find environment variable usage
rg "config\." apps/nexus-core/src

# Find event emissions
rg "appEvents.emit" apps/nexus-core/src
```

## Key Files

| File | Purpose |
|------|---------|
| `apps/nexus-core/src/domains/*/types.ts` | Domain schemas |
| `apps/nexus-core/src/infra/events.ts` | WebSocket event definitions |
| `apps/nexus-core/src/infra/config.ts` | Environment variables |
| `apps/nexus/src/app.ts` | Elysia API composition |
| `apps/dashboard/src/lib/api.ts` | Eden Treaty client |
| `apps/dashboard/src/lib/useEvents.ts` | WebSocket hook |
