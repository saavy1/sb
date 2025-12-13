# homelab-elysia

Central API for homelab automation. Built with Elysia + Drizzle + Bun.

## Features

- **Game Servers** - Create, start, stop, delete Minecraft servers in K8s
- **Multi-DB SQLite** - Separate databases per domain (minecraft, core)
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
| `DB_PATH` | SQLite database directory | ./db |
| `INTERNAL_API_KEY` | Key for internal K8s routes | - |
| `K8S_NAMESPACE` | K8s namespace for game servers | game-servers |
| `MC_DEFAULT_MEMORY` | Default Minecraft memory | 8Gi |
| `CURSEFORGE_API_KEY` | CurseForge API key | - |

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

## Tech Stack

- [Bun](https://bun.sh) runtime
- [Elysia](https://elysiajs.com) web framework
- [Drizzle ORM](https://orm.drizzle.team) with bun:sqlite
- TypeScript

## Project Structure

```
src/
├── index.ts                    # App entry
├── infra/
│   ├── config.ts              # Environment config
│   ├── db.ts                  # Drizzle + SQLite setup
│   ├── db-push.ts             # Schema push script
│   └── migrate.ts             # Migration runner
├── middleware/
│   ├── authelia.ts            # Authelia header extraction
│   └── internal.ts            # Internal route protection
├── routes/
│   ├── public.ts              # Public routes
│   ├── private.ts             # Auth-protected routes
│   └── internal.ts            # K8s internal routes
└── domains/
    ├── game-servers/
    │   ├── schema.ts          # Drizzle table definition
    │   ├── types.ts           # Elysia t.* schemas
    │   ├── repository.ts      # Database queries
    │   ├── service.ts         # Business logic
    │   ├── k8s-adapter.ts     # K8s manifest generation
    │   └── routes.ts          # API routes
    └── core/
        └── schema.ts          # jobs, users, permissions tables
```

## Database

Uses separate SQLite databases per domain:

- `db/minecraft.sqlite` - Game server metadata
- `db/core.sqlite` - Jobs, users, permissions

```bash
# Push schema changes to database
bun run db:push

# Generate migrations (for version control)
bun run db:generate
```