# Optional ingestion worker, for INGESTION_MODE=queue.

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.14.0 --activate

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY scripts/ ./scripts/
COPY packages/ ./packages/
COPY apps/ ./apps/
COPY workers/ ./workers/
RUN pnpm install --frozen-lockfile --ignore-scripts=false
RUN pnpm --filter @intel/ingestion-worker build
RUN pnpm --filter @intel/ingestion-worker deploy --prod /deploy

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder --chown=app:app /deploy/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/workers/ingestion-worker/dist ./dist
COPY --from=builder --chown=app:app /app/workers/ingestion-worker/package.json ./package.json
USER app
CMD ["node", "dist/index.js"]
