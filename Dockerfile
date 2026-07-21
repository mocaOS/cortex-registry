# syntax=docker/dockerfile:1
#
# Production image for the Cortex Registry browse site + JSON API (site/, Next.js 15).
#
# Layout inside the image mirrors the repo so the app's catalog loader works
# unchanged: site/src/lib/catalog.ts reads `process.cwd()/../index.json`. We run
# `next start` from /app/site, so cwd/../index.json resolves to /app/index.json —
# the catalog baked in at build time (falls back to REGISTRY_INDEX_URL if absent).

FROM node:22-alpine AS base
# libc6-compat: SWC's native binary needs it on Alpine musl.
RUN apk add --no-cache libc6-compat
ENV NEXT_TELEMETRY_DISABLED=1

# ---- deps: full install (incl. dev) for the build ----
FROM base AS deps
WORKDIR /app/site
COPY site/package.json site/package-lock.json ./
RUN npm ci

# ---- builder: compile the Next.js app ----
FROM base AS builder
WORKDIR /app/site
COPY --from=deps /app/site/node_modules ./node_modules
COPY site/ ./
# index.json must sit one level above the site cwd — Next prerenders `/` at
# build time and evaluates loadCatalog(), which reads ../index.json from disk.
COPY index.json /app/index.json
RUN npm run build

# ---- prod-deps: runtime-only dependencies (smaller image) ----
FROM base AS prod-deps
WORKDIR /app/site
COPY site/package.json site/package-lock.json ./
RUN npm ci --omit=dev

# ---- runner: what actually ships ----
FROM base AS runner
WORKDIR /app/site
ENV NODE_ENV=production
# `next start -p 4321` (from package.json) binds 0.0.0.0:4321 by default.
ENV PORT=4321
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs
COPY --from=prod-deps --chown=nextjs:nodejs /app/site/node_modules ./node_modules
# .next must be writable: revalidate=300 (ISR) rewrites .next/cache at runtime.
COPY --from=builder --chown=nextjs:nodejs /app/site/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/site/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/site/next.config.mjs ./next.config.mjs
COPY --chown=nextjs:nodejs index.json /app/index.json
USER nextjs
EXPOSE 4321
CMD ["npm", "run", "start"]
