# Superbloom Roadmap

Long-term goals and exploration areas.

## Infrastructure

### Frigate NVR with Vision Detection
Deploy Frigate on Spark with a vision/object detection model for camera feeds. Use the ZFS pool for rolling storage so recordings cycle automatically without filling disk.

### Minecraft Game Servers via Helm
Replace the current hand-rolled manifests for Minecraft game-servers with a proper Helm chart deployment. Cleaner upgrades, consistent config management, and easier scaling.

### Smarter CI Builds (Argo Workflows)
Argo Workflows currently rebuilds all Nexus images on every push. Add change detection so only apps/packages/services with actual code changes get built and pushed. Could use path-based filtering in the workflow event binding or a pre-build step that diffs against the last successful build.

## Nexus AI / The Machine

### Dynamic Model Loading
Design a system to dynamically load and unload AI models on demand rather than keeping them all resident. Likely involves a model registry, health checks, and GPU memory management.

### Multi-Model Architecture
Explore a tiered approach: route complex reasoning to a large model via OpenRouter, delegate simpler/faster tasks to small local models. Could reduce latency and cost for routine operations while keeping quality for hard problems.

### Subagents / Parallel Execution
Investigate spawning subagents that execute commands in parallel. Would speed up multi-step operations like deploying across services, running diagnostics, or gathering info from multiple sources simultaneously.

### Agent Skills System
Create a skills framework for Nexus -- composable, reusable capabilities the agent can invoke. Think: "deploy service X", "run migration", "check cluster health" as first-class skills rather than ad-hoc tool calls.

### Long-Term Memory (FalkorDB Spike)
Spike on FalkorDB or similar graph-based memory as a replacement/supplement for current memory. Goal: better contextual recall, relationship tracking between entities, and persistent knowledge that improves over time.

## Data Layer

### SpacetimeDB Migration
Evaluate swapping Postgres entirely for SpacetimeDB. Would unify the database and real-time sync layer, potentially replacing both Drizzle/Postgres and the WebSocket event system with a single reactive data store.

## Smart Home

### Matter MCP Integration
Get the Matter MCP server working with the new Matter-compatible devices. Would give Nexus direct control over smart home devices through a standardized protocol.
