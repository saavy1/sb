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

# Create db directory
RUN mkdir -p /app/db && chown bun:bun /app/db

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY package.json ./

# SQLite databases will be stored here
VOLUME /app/db

ENV PORT=3000
ENV DB_PATH=/app/db
ENV NODE_ENV=production

EXPOSE 3000

USER bun
CMD ["bun", "run", "src/index.ts"]
