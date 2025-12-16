# Dashboard

React web dashboard for managing Superbloom homelab services. Consumes the [Nexus](../nexus) API via Eden Treaty.

## Features

- **Server Management** - View, create, start, stop game servers
- **Storage Monitoring** - View storage usage and status
- **Logs Viewer** - View application logs
- **Settings** - Configure homelab settings

## Setup

```bash
# Install dependencies (from monorepo root)
bun install

# Run in development
bun run dev:dashboard  # Runs on :3001
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Nexus API URL | `http://localhost:3000` (dev) / same origin (prod) |

## Tech Stack

- [Bun](https://bun.sh) runtime
- [React 19](https://react.dev)
- [TanStack Router](https://tanstack.com/router) - Type-safe file-based routing
- [TanStack Form](https://tanstack.com/form) - Form management
- [Eden Treaty](https://elysiajs.com/eden/treaty) - Type-safe Nexus API client
- [Tailwind CSS v4](https://tailwindcss.com) - Styling
- [Shadcn/ui](https://ui.shadcn.com) - UI components
- [Vite](https://vitejs.dev) - Build tooling
- [Biome](https://biomejs.dev) - Linting and formatting

## Scripts

| Script | Description |
|--------|-------------|
| `dev` | Run dev server on :3001 |
| `build` | Build for production |
| `preview` | Preview production build |
| `test` | Run tests with Vitest |
| `lint` | Run Biome linter |
| `format` | Format with Biome |
| `check` | Run all Biome checks |

## Project Structure

```
src/
├── main.tsx              # App entry
├── env.ts                # Environment config (T3Env)
├── lib/
│   ├── api.ts            # Eden Treaty client to Nexus
│   └── utils.ts          # Utility functions
├── components/
│   ├── layout/           # Layout components (Sidebar, etc.)
│   └── ui/               # Shadcn UI components
└── routes/
    ├── __root.tsx        # Root layout
    ├── index.tsx         # Home/dashboard
    ├── servers.tsx       # Server list
    ├── servers_.new.tsx  # Create server form
    ├── storage.tsx       # Storage view
    ├── logs.tsx          # Logs viewer
    └── settings.tsx      # Settings page
```
