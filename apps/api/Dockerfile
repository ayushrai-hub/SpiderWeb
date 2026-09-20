# Build the API into a single self-contained bundle, then ship only that plus
# its runtime node_modules.

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.14.0 --activate

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY scripts/ ./scripts/
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
COPY workers/ ./workers/
RUN pnpm install --frozen-lockfile --ignore-scripts=false
RUN pnpm --filter @intel/api build
# Re-install with production dependencies only, for the runtime image.
RUN pnpm --filter @intel/api deploy --prod /deploy

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder --chown=app:app /deploy/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/apps/api/dist ./dist
COPY --from=builder --chown=app:app /app/apps/api/package.json ./package.json
USER app
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3001)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "dist/index.js"]
