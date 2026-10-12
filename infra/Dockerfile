# syntax=docker/dockerfile:1.7
# Images für Betrieb (Spec Abschnitt 13): API, Web (Next standalone) und Migrationen aus einem Build.
#   docker build -f infra/Dockerfile --target api -t schulplattform-api .
#   docker build -f infra/Dockerfile --target web -t schulplattform-web .
#   docker build -f infra/Dockerfile --target migrate -t schulplattform-migrate .
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1 CI=true
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable
WORKDIR /repo

FROM base AS build
# Ziel der API für den Proxy /api/v1 der Web-App (wird beim Build in die Routen übernommen)
ARG API_URL=http://api:4000
ENV API_URL=$API_URL
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm db:generate \
  && pnpm --filter @sp/shared build \
  && pnpm --filter @sp/db build \
  && pnpm --filter @sp/ui build \
  && pnpm --filter @sp/api build \
  && NEXT_STANDALONE=1 pnpm --filter @sp/web exec next build

# Migrationen und Mandanten-Anlage (prisma migrate deploy, Rolle sp_app, pnpm tenant:create)
FROM build AS migrate
CMD ["pnpm", "--filter", "@sp/db", "migrate:deploy"]

# API: gebautes Monorepo ohne Quelltexte der Web-App; läuft als unprivilegierter Nutzer
FROM base AS api
ENV NODE_ENV=production API_HOST=0.0.0.0 PORT=4000
COPY --from=build /repo/node_modules /repo/node_modules
COPY --from=build /repo/package.json /repo/pnpm-workspace.yaml /repo/
COPY --from=build /repo/packages/shared/package.json /repo/packages/shared/
COPY --from=build /repo/packages/shared/dist /repo/packages/shared/dist
COPY --from=build /repo/packages/shared/node_modules /repo/packages/shared/node_modules
COPY --from=build /repo/packages/db/package.json /repo/packages/db/
COPY --from=build /repo/packages/db/dist /repo/packages/db/dist
COPY --from=build /repo/packages/db/node_modules /repo/packages/db/node_modules
COPY --from=build /repo/apps/api/package.json /repo/apps/api/
COPY --from=build /repo/apps/api/dist /repo/apps/api/dist
COPY --from=build /repo/apps/api/node_modules /repo/apps/api/node_modules
WORKDIR /repo/apps/api
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:4000/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]

# Web: Next.js standalone (nur die nötigen Abhängigkeiten)
FROM node:22-bookworm-slim AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/offline').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
