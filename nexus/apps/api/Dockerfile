# Prune stage - create minimal workspace for API
FROM oven/bun:1.3.3 AS pruner
RUN bun add -g turbo@2.6.3
WORKDIR /app
COPY . .
RUN turbo prune @nexus/api --docker

# UI Build stage - build the dashboard
FROM oven/bun:1.3.3 AS ui-builder
RUN bun add -g turbo@2.6.3
WORKDIR /app
COPY . .
RUN turbo prune @nexus/ui --docker
WORKDIR /app/out/full
# Copy root tsconfig.json that UI extends
RUN cp /app/tsconfig.json .
RUN bun install --frozen-lockfile --ignore-scripts
RUN cd apps/ui && bun run build

# Install stage - API dependencies
FROM oven/bun:1.3.3 AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN bun install --ignore-scripts

# Runtime stage
FROM oven/bun:1.3.3
WORKDIR /app

# Install tailscale CLI + ssh client for Tailscale SSH to host
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates openssh-client \
    && curl -fsSL https://tailscale.com/install.sh | sh \
    && rm -rf /var/lib/apt/lists/*

COPY --from=installer /app/node_modules ./node_modules
COPY --from=installer /app/packages ./packages
COPY --from=pruner /app/out/full/apps/api ./apps/api
COPY --from=pruner /app/out/full/packages ./packages

# Recreate workspace symlinks (buildx multi-platform builds drop symlinks
# that point outside the COPY source tree during multi-stage COPY)
RUN mkdir -p node_modules/@nexus && \
    for pkg in packages/*/; do \
      name=$(basename "$pkg") && \
      ln -sf "../../packages/$name" "node_modules/@nexus/$name"; \
    done

# Copy built dashboard
COPY --from=ui-builder /app/out/full/apps/ui/dist ./apps/api/public/

RUN mkdir -p /app/db && chmod -R 777 /app/db

ENV PORT=3000
ENV DB_PATH=/app/db
ENV NODE_ENV=production

EXPOSE 3000
WORKDIR /app/apps/api
# User set via K8s securityContext (runAsUser: 1000)
CMD ["bun", "src/index.ts"]
