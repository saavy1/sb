# Prune stage - create minimal workspace for API
FROM oven/bun:1 AS pruner
RUN bun add -g turbo
WORKDIR /app
COPY . .
RUN turbo prune @nexus/api --docker

# UI Build stage - build the dashboard
FROM oven/bun:1 AS ui-builder
RUN bun add -g turbo
WORKDIR /app
COPY . .
RUN turbo prune @nexus/ui --docker
WORKDIR /app/out/full
# Copy root tsconfig.json that UI extends
RUN cp /app/tsconfig.json .
RUN bun install --frozen-lockfile --ignore-scripts
RUN cd apps/ui && bun run build

# Install stage - API dependencies
FROM oven/bun:1 AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN bun install --frozen-lockfile --production --ignore-scripts

# Runtime stage
FROM oven/bun:1
WORKDIR /app

COPY --from=installer /app/node_modules ./node_modules
COPY --from=installer /app/packages ./packages
COPY --from=pruner /app/out/full/apps/api ./apps/api
COPY --from=pruner /app/out/full/packages ./packages

# Copy built dashboard
COPY --from=ui-builder /app/out/full/apps/ui/dist ./apps/api/public/

RUN mkdir -p /app/db && chown -R bun:bun /app/db /app/apps/api

ENV PORT=3000
ENV DB_PATH=/app/db
ENV NODE_ENV=production

EXPOSE 3000
WORKDIR /app/apps/api
USER bun
CMD ["bun", "src/index.ts"]
