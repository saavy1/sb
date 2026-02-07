# Prune stage - create minimal workspace
FROM oven/bun:1.3.3 AS pruner
RUN bun add -g turbo
WORKDIR /app
COPY . .
RUN turbo prune @nexus/worker-embeddings --docker

# Install stage
FROM oven/bun:1.3.3 AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN bun install --ignore-scripts

# Runtime stage
FROM oven/bun:1.3.3
WORKDIR /app

COPY --from=installer /app/node_modules ./node_modules
COPY --from=installer /app/packages ./packages
COPY --from=pruner /app/out/full/workers/embeddings ./workers/embeddings
COPY --from=pruner /app/out/full/packages ./packages

# Recreate workspace symlinks (buildx multi-platform builds drop symlinks
# that point outside the COPY source tree during multi-stage COPY)
RUN mkdir -p node_modules/@nexus && \
    for pkg in packages/*/; do \
      name=$(basename "$pkg") && \
      ln -sf "../../packages/$name" "node_modules/@nexus/$name"; \
    done

ENV NODE_ENV=production
WORKDIR /app/workers/embeddings
USER bun
CMD ["bun", "src/index.ts"]
