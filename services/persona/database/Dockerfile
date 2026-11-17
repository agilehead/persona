FROM node:26.13.1-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS dependencies
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --workspaces=false

FROM node:26.13.1-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS migrations
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
WORKDIR /app
COPY package.json package-lock.json ./
COPY --from=dependencies /app/node_modules ./node_modules
COPY services/persona/knexfile.persona.mjs ./services/persona/knexfile.persona.mjs
COPY services/persona/database/persona/sqlite/migrations ./services/persona/database/persona/sqlite/migrations
RUN mkdir -p /app/data
ENV NODE_ENV=production
CMD ["./node_modules/.bin/knex", "migrate:latest", "--knexfile", "services/persona/knexfile.persona.mjs", "--env", "production"]
