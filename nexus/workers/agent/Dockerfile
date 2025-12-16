# Prune stage - create minimal workspace
FROM oven/bun:1 AS pruner
RUN bun add -g turbo
WORKDIR /app
COPY . .
RUN turbo prune @nexus/worker-agent --docker

# Install stage
FROM oven/bun:1 AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN bun install --frozen-lockfile --production --ignore-scripts

# Runtime stage
FROM oven/bun:1
WORKDIR /app

COPY --from=installer /app/node_modules ./node_modules
COPY --from=installer /app/packages ./packages
COPY --from=pruner /app/out/full/workers/agent ./workers/agent
COPY --from=pruner /app/out/full/packages ./packages

ENV NODE_ENV=production
WORKDIR /app/workers/agent
USER bun
CMD ["bun", "src/index.ts"]
