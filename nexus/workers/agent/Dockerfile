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

# Install system tools for ops (kubectl, flux, helm, ssh)
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssh-client curl ca-certificates && rm -rf /var/lib/apt/lists/*

RUN curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" \
    && chmod +x kubectl && mv kubectl /usr/local/bin/

RUN curl -s https://fluxcd.io/install.sh | bash

RUN curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

ENV NODE_ENV=production
WORKDIR /app/workers/agent
USER bun
CMD ["bun", "src/index.ts"]
