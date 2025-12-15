FROM oven/bun:1 AS base
WORKDIR /workspace

# Copy workspace configuration first
COPY package.json bun.lock* ./

# Build dashboard
FROM base AS build-dashboard
COPY dashboard/package.json ./dashboard/package.json
RUN bun install --frozen-lockfile --cwd dashboard
COPY dashboard ./dashboard/
RUN cd dashboard && bun run build

# Install dependencies and build Nexus
FROM base AS build
COPY logger/package.json ./logger/package.json
COPY nexus/package.json ./nexus/package.json
RUN bun install --cwd nexus
COPY logger ./logger/
COPY nexus/src ./nexus/src
COPY nexus/tsconfig.json ./nexus/
RUN cd nexus && bun run typecheck

# Production dependencies
FROM base AS deps
COPY logger/package.json ./logger/package.json
COPY nexus/package.json ./nexus/package.json
RUN bun install --production --cwd nexus
COPY logger ./logger/

# Runtime
FROM oven/bun:1 AS runtime
WORKDIR /app

# Install system tools for GPU monitoring and k8s CLI tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    intel-gpu-tools \
    pciutils \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install kubectl
RUN curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" \
    && chmod +x kubectl \
    && mv kubectl /usr/local/bin/

# Install flux CLI
RUN curl -s https://fluxcd.io/install.sh | bash

# Create db and public directories
RUN mkdir -p /app/db /app/public && chown -R bun:bun /app/db /app/public

COPY --from=deps /workspace/nexus/node_modules ./node_modules
COPY --from=build /workspace/nexus/src ./src
COPY --from=build-dashboard /workspace/dashboard/dist ./public
COPY --from=deps /workspace/logger ./node_modules/logger
COPY nexus/package.json ./
COPY nexus/drizzle ./drizzle

# SQLite databases will be stored here
VOLUME /app/db

ENV PORT=3000
ENV DB_PATH=/app/db
ENV NODE_ENV=production

EXPOSE 3000

USER bun
CMD ["bun", "run", "src/index.ts"]
