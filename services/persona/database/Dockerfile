FROM node:24.22.1-alpine AS dependencies
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --workspaces=false

FROM node:24.22.1-alpine AS migrations
WORKDIR /app
COPY package.json package-lock.json ./
COPY --from=dependencies /app/node_modules ./node_modules
COPY services/persona/knexfile.persona.mjs ./services/persona/knexfile.persona.mjs
COPY services/persona/database/persona/sqlite/migrations ./services/persona/database/persona/sqlite/migrations
RUN mkdir -p /app/data
ENV NODE_ENV=production
CMD ["./node_modules/.bin/knex", "migrate:latest", "--knexfile", "services/persona/knexfile.persona.mjs", "--env", "production"]
