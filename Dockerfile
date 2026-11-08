# syntax=docker/dockerfile:1

# ---- deps: install node_modules (postinstall runs `prisma generate`, so the schema is needed) ----
FROM node:22-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Match the npm that wrote package-lock.json (npm 10 misreads its optional platform deps).
RUN npm install -g npm@11.6.2
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---- build: compile the Next.js standalone server ----
FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Placeholder only so modules that read it at import time don't fail during the build (nothing connects).
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate && npm run build

# ---- runtime ----
FROM node:22-bookworm-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends openssl tini && rm -rf /var/lib/apt/lists/*
# Prisma CLI for `migrate deploy` at startup — pinned to the version in package-lock.json.
RUN npm install -g prisma@6.12.0 && npm cache clean --force

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=build --chown=node:node /app/prisma/migrations ./prisma/migrations
# Old SQLite migrations + better-sqlite3, for the one-off move to Postgres (docker/migrate-from-sqlite.sh).
COPY --from=build --chown=node:node /app/prisma/sqlite ./prisma/sqlite
COPY --from=deps --chown=node:node /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=deps --chown=node:node /app/node_modules/bindings ./node_modules/bindings
COPY --from=deps --chown=node:node /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path
# Next bundles bcryptjs into the server, so the admin bootstrap script needs its own copy.
COPY --from=deps --chown=node:node /app/node_modules/bcryptjs ./node_modules/bcryptjs
COPY --chown=node:node docker ./docker
RUN chmod +x /app/docker/entrypoint.sh /app/docker/migrate-from-sqlite.sh

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--", "/app/docker/entrypoint.sh"]
CMD ["node", "server.js"]
