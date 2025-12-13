FROM oven/bun:1 AS base
WORKDIR /workspace

# Copy workspace configuration first
COPY package.json bun.lock* ./

# Install dependencies and build
FROM base AS build
COPY the-machine/package.json ./the-machine/package.json
RUN bun install --cwd the-machine
COPY the-machine/src ./the-machine/src
COPY the-machine/tsconfig.json ./the-machine/
RUN cd the-machine && bun run typecheck

# Production dependencies
FROM base AS deps
COPY the-machine/package.json ./the-machine/package.json
RUN bun install --production --cwd the-machine

# Runtime
FROM oven/bun:1 AS runtime
WORKDIR /app

COPY --from=deps /workspace/the-machine/node_modules ./node_modules
COPY --from=build /workspace/the-machine/src ./src
COPY the-machine/package.json ./

ENV NODE_ENV=production

USER bun
CMD ["bun", "run", "src/index.ts"]
