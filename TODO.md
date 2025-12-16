# Future Refactoring

## Monorepo Structure Reorganization

Reorganize from flat `apps/` to a cleaner `nexus/` structure:

```
sb/
├── nixos/
├── flux/
└── nexus/
    ├── apps/
    │   ├── api/           # HTTP API (current nexus)
    │   ├── ui/            # Dashboard
    │   └── bot/           # Discord bot (the-machine)
    ├── packages/
    │   ├── core/          # Shared business logic, schemas, types
    │   ├── logger/
    │   ├── k8s/
    │   └── mc-monitor/    # Protocol library
    └── workers/
        ├── agent/         # Agent wake + system events
        ├── embeddings/
        └── mc-monitor/    # Status polling service
```

**Benefits:**
- Clear taxonomy: apps (interfaces), packages (libraries), workers (background)
- Dockerfiles colocated with their services
- Cleaner import paths: `@nexus/core`, `@nexus/logger`

**Migration steps:**
1. Create new folder structure
2. Move code to new locations
3. Update package.json names
4. Update tsconfig paths
5. Update bun workspace config
6. Update GitHub workflows
7. Update Flux deployments
8. Update Dockerfiles and their paths
