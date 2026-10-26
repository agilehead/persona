# Explicit Node comparison image; production defaults to services/persona/csharp/Dockerfile.
FROM node:24.22.1-alpine AS build-base
WORKDIR /app
RUN apk add --no-cache bash python3 make g++

FROM build-base AS builder
COPY package.json package-lock.json tsconfig.base.json ./
COPY services/persona ./services/persona
COPY scripts ./scripts
RUN npm ci && ./scripts/build.sh --no-format

FROM builder AS development
ENV NODE_ENV=development
CMD ["node", "--import", "tsx", "services/persona/node/apps/server/src/bin/server.ts"]

FROM build-base AS runtime-deps
COPY package.json package-lock.json ./
COPY services/persona/package.json ./services/persona/package.json
COPY services/persona/node ./services/persona/node
RUN npm ci --omit=dev

FROM node:24.22.1-alpine AS production
WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=runtime-deps /app/node_modules ./node_modules
COPY --from=builder /app/services/persona/node/apps/server/dist ./services/persona/node/apps/server/dist
COPY --from=builder /app/services/persona/node/apps/server/package.json ./services/persona/node/apps/server/package.json
COPY --from=builder /app/services/persona/node/packages/persona-db/dist ./services/persona/node/packages/persona-db/dist
COPY --from=builder /app/services/persona/node/packages/persona-db/package.json ./services/persona/node/packages/persona-db/package.json
COPY --from=builder /app/services/persona/node/packages/persona-logger/dist ./services/persona/node/packages/persona-logger/dist
COPY --from=builder /app/services/persona/node/packages/persona-logger/package.json ./services/persona/node/packages/persona-logger/package.json
ENV NODE_ENV=production
STOPSIGNAL SIGTERM
ENTRYPOINT ["node", "services/persona/node/apps/server/dist/bin/server.js"]
