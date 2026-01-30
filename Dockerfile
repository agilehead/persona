# Build stage - Use Ubuntu to match runtime for native modules
FROM ubuntu:24.04 AS builder

# Install Node.js 24 and build dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    python3 \
    make \
    g++ && \
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY node/package*.json ./node/
COPY node/packages/persona-logger/package*.json ./node/packages/persona-logger/
COPY node/packages/persona-db/package*.json ./node/packages/persona-db/
COPY node/packages/persona-test-utils/package*.json ./node/packages/persona-test-utils/
COPY node/packages/persona-server/package*.json ./node/packages/persona-server/

# Copy build scripts from scripts directory
COPY scripts/ ./scripts/

# Copy source code
COPY tsconfig.base.json ./
COPY knexfile.js ./
COPY node ./node
COPY database ./database

# Install dependencies and build
RUN chmod +x scripts/build.sh scripts/clean.sh scripts/format-all.sh scripts/install-deps.sh && \
    ./scripts/build.sh --install

# Runtime stage - Ubuntu minimal
FROM ubuntu:24.04 AS runtime

# Install Node.js 24 and minimal dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl \
    ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -r -u 1001 -g root -s /bin/bash persona && \
    mkdir -p /home/persona && \
    chown -R persona:root /home/persona

WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=persona:root /app/node ./node
COPY --from=builder --chown=persona:root /app/database ./database
COPY --from=builder --chown=persona:root /app/package*.json ./
COPY --from=builder --chown=persona:root /app/node_modules ./node_modules
COPY --from=builder --chown=persona:root /app/knexfile.js ./

# Copy start script and entrypoint
COPY --chown=persona:root scripts/start.sh scripts/docker-entrypoint.sh ./
RUN chmod +x start.sh docker-entrypoint.sh

# Switch to non-root user
USER persona

# Expose server port
EXPOSE 5005

# Set default environment variables (non-sensitive only)
ENV NODE_ENV=production \
    PERSONA_SERVER_PORT=5005 \
    LOG_LEVEL=info

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:' + (process.env.PERSONA_SERVER_PORT || 5005) + '/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

# Use entrypoint for automatic setup
ENTRYPOINT ["./docker-entrypoint.sh"]
