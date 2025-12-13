FROM oven/bun:1 AS base
WORKDIR /app

# Build dashboard
FROM base AS build-dashboard
WORKDIR /dashboard
COPY dashboard/package.json dashboard/bun.lock ./
RUN bun install --frozen-lockfile
COPY dashboard ./
RUN bun run build

# Install dependencies and build Nexus
FROM base AS build
COPY nexus/package.json ./
RUN bun install
COPY nexus/src ./src
COPY nexus/tsconfig.json ./
RUN bun run typecheck

# Production dependencies
FROM base AS deps
COPY nexus/package.json ./
RUN bun install --production

# Runtime
FROM base AS runtime

# Create db and public directories
RUN mkdir -p /app/db /app/public && chown -R bun:bun /app/db /app/public

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build-dashboard /dashboard/dist ./public
COPY nexus/package.json ./

# SQLite databases will be stored here
VOLUME /app/db

ENV PORT=3000
ENV DB_PATH=/app/db
ENV NODE_ENV=production

EXPOSE 3000

USER bun
CMD ["bun", "run", "src/index.ts"]
