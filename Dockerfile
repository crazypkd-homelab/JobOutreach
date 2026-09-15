# ---------- build ----------
# Must match the Node major shipped in the runtime image (better-sqlite3 is a native module).
FROM node:24-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /src

# Native deps (better-sqlite3) need a toolchain when no prebuilt binary matches.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile

COPY packages ./packages
COPY prompts ./prompts
RUN pnpm build

# Production-only node_modules for the server (server bundle inlines @joboutreach/shared).
RUN pnpm --filter @joboutreach/server deploy --prod --legacy /out/server

# ---------- runtime ----------
# Playwright base image ships Chromium + system deps. Keep the tag in sync with the
# `playwright` npm version when it is added.
FROM mcr.microsoft.com/playwright:v1.62.1-noble AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /out/server/node_modules ./node_modules
COPY --from=build /src/packages/server/dist ./dist
COPY --from=build /src/packages/server/drizzle ./drizzle
COPY --from=build /src/packages/web/dist ./web
COPY --from=build /src/prompts ./prompts
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://localhost:8787/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
