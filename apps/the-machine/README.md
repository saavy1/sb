# docker-discord-bot

Discord bot for managing game servers. Thin client that calls the [homelab-elysia](../homelab-elysia) API.

## Features

- `/server create <name> <modpack>` - Create a new Minecraft server
- `/server start` - Start a stopped server (select menu)
- `/server stop` - Stop a running server (select menu)
- `/server list` - List all servers with status
- `/server status <name>` - Get detailed server info
- `/server delete <name>` - Delete a server
- `/health` - Check bot and API connectivity

## Setup

```bash
# Install dependencies (from monorepo root)
bun install

# Copy environment file
cp .env.example .env
# Edit .env with your Discord credentials

# Run in development
bun run dev
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DISCORD_TOKEN` | Discord bot token | Yes |
| `DISCORD_CLIENT_ID` | Discord application client ID | Yes |
| `ELYSIA_API_URL` | Elysia API URL (default: http://localhost:3000) | No |
| `ELYSIA_API_KEY` | API key for Elysia (optional) | No |

## Tech Stack

- [Bun](https://bun.sh) runtime
- [discord.js v15](https://discord.js.org) (pre-release)
- TypeScript

## Project Structure

```
src/
├── index.ts        # Bot entry point
├── config.ts       # Environment config
├── api.ts          # Elysia API client
├── types.ts        # Shared types
└── commands/
    ├── index.ts    # Command registry
    ├── server.ts   # /server subcommands
    └── health.ts   # /health command
```
