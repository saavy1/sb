FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies and build
FROM base AS build
COPY package.json ./
RUN bun install
COPY src ./src
COPY tsconfig.json ./
RUN bun run typecheck

# Production dependencies
FROM base AS deps
COPY package.json ./
RUN bun install --production

# Runtime
FROM base AS runtime
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY package.json ./

ENV NODE_ENV=production

USER bun
CMD ["bun", "run", "src/index.ts"]
