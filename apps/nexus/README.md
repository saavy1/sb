# Nexus

Central Elysia API control plane for Superbloom homelab automation. Built with Elysia + Drizzle + Bun.

## Features

- **Game Servers** - Create, start, stop, delete Minecraft servers in K8s
- **Agent System** - AI-powered autonomous agents with BullMQ job queues
- **Multi-Database** - SQLite per domain + PostgreSQL for agent state
- **DDD Architecture** - Domain-driven design with clear boundaries
- **OpenAPI** - Auto-generated docs at `/openapi`
- **Auth Ready** - Authelia header extraction for forward auth

## Setup

```bash
# Install dependencies (from monorepo root)
bun install

# Create databases and tables
bun run db:push

# Copy environment file
cp .env.example .env

# Run in development
bun run dev
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment | development |
| `MODE` | Run mode: `api`, `worker`, or `both` | both |
| `DB_PATH` | SQLite database directory | ./db |
| `DATABASE_URL` | PostgreSQL connection URL (for agent state) | - |
| `VALKEY_URL` | Valkey/Redis URL (for BullMQ queues) | redis://localhost:6379 |
| `INTERNAL_API_KEY` | Key for internal K8s routes | - |
| `K8S_NAMESPACE` | K8s namespace for game servers | game-servers |
| `MC_DEFAULT_MEMORY` | Default Minecraft memory | 8Gi |
| `CURSEFORGE_API_KEY` | CurseForge API key | - |
| `OPENROUTER_API_KEY` | OpenRouter API key for AI agents | - |

## API Routes

### Public (no auth)
- `GET /health` - Health check
- `GET /api/status` - API status

### Private (Authelia forward auth)
- `GET /api/game-servers` - List servers
- `GET /api/game-servers/:name` - Get server
- `POST /api/game-servers` - Create server
- `POST /api/game-servers/:name/start` - Start server
- `POST /api/game-servers/:name/stop` - Stop server
- `DELETE /api/game-servers/:name` - Delete server

### Internal (K8s svc-to-svc)
- `GET /internal/game-servers` - List servers
- `POST /internal/webhooks/k8s` - K8s event webhook

## Kubernetes Setup

Nexus requires RBAC permissions to manage game server resources. Apply this to your cluster:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: nexus
  namespace: minecraft
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: nexus-manager
  namespace: minecraft
rules:
- apiGroups: [""]
  resources: ["services", "persistentvolumeclaims"]
  verbs: ["get", "list", "create", "update", "patch", "delete"]
- apiGroups: ["apps"]
  resources: ["deployments", "deployments/scale", "deployments/status"]
  verbs: ["get", "list", "create", "update", "patch", "delete"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: nexus-manager-binding
  namespace: minecraft
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: nexus-manager
subjects:
- kind: ServiceAccount
  name: nexus
  namespace: minecraft
```

Then update your nexus Deployment to use the ServiceAccount:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nexus
spec:
  template:
    spec:
      serviceAccountName: nexus  # Add this line
      containers:
      - name: nexus
        # ... rest of config
```

## Tech Stack

- [Bun](https://bun.sh) runtime
- [Elysia](https://elysiajs.com) web framework
- [Drizzle ORM](https://orm.drizzle.team) with bun:sqlite + postgres-js
- [BullMQ](https://docs.bullmq.io) job queues with Valkey (Redis-compatible)
- [@kubernetes/client-node](https://github.com/kubernetes-client/javascript) for K8s API
- TypeScript

## Project Structure

```
src/
├── index.ts                    # App entry
├── infra/
│   ├── config.ts              # Environment config
│   ├── db.ts                  # Database connections (SQLite + PostgreSQL)
│   ├── queue.ts               # BullMQ queues and workers
│   ├── events.ts              # WebSocket event emitter
│   └── migrate.ts             # Migration runner
├── middleware/
│   ├── authelia.ts            # Authelia header extraction
│   └── internal.ts            # Internal route protection
├── routes/
│   ├── public.ts              # Public routes
│   ├── private.ts             # Auth-protected routes
│   └── internal.ts            # K8s internal routes
└── domains/
    ├── agent/                 # AI agent system (PostgreSQL)
    │   ├── schema.ts          # PostgreSQL tables (conversations, messages)
    │   ├── worker.ts          # BullMQ job processor
    │   └── routes.ts          # Chat API routes
    ├── game-servers/          # Game server management (SQLite)
    │   ├── schema.ts          # Drizzle table definition
    │   ├── types.ts           # Elysia t.* schemas
    │   ├── service.ts         # Business logic
    │   ├── k8s-adapter.ts     # K8s manifest generation
    │   └── routes.ts          # API routes
    ├── ops/                   # Operations & automation (SQLite)
    ├── apps/                  # App launcher config (SQLite)
    ├── system-info/           # System metrics (SQLite)
    └── core/                  # Core tables (SQLite)
```

## Database

Nexus uses a hybrid database approach:

### SQLite (per-domain, file-based)
- `db/minecraft.sqlite` - Game server metadata
- `db/core.sqlite` - Jobs, users, permissions
- `db/ops.sqlite` - Operations and automation
- `db/apps.sqlite` - App launcher configuration
- `db/system-info.sqlite` - System metrics

### PostgreSQL (shared, for concurrency)
- Agent conversations, messages, and state
- Required for concurrent worker processes

### Valkey + BullMQ (job queues)
- `agent-wakes` - AI agent wake/processing jobs
- `events-system` - System event processing

```bash
# Push schema changes to all databases
bun run db:push

# Generate migrations (for version control)
bun run db:generate          # All schemas
bun run db:generate:agent    # Agent schema only (PostgreSQL)
```