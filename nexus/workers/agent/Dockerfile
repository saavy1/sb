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

# Install tailscale CLI + ssh client for Tailscale SSH to host
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates openssh-client \
    && curl -fsSL https://tailscale.com/install.sh | sh \
    && rm -rf /var/lib/apt/lists/*

COPY --from=installer /app/node_modules ./node_modules
COPY --from=installer /app/packages ./packages
COPY --from=pruner /app/out/full/workers/agent ./workers/agent
COPY --from=pruner /app/out/full/packages ./packages

# Recreate workspace symlinks (buildx multi-platform builds drop symlinks
# that point outside the COPY source tree during multi-stage COPY)
RUN mkdir -p node_modules/@nexus && \
    for pkg in packages/*/; do \
      name=$(basename "$pkg") && \
      ln -sf "../../packages/$name" "node_modules/@nexus/$name"; \
    done

ENV NODE_ENV=production
WORKDIR /app/workers/agent
USER bun
CMD ["bun", "src/index.ts"]
