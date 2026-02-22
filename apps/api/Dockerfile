# ─── Stage 1: Install dependencies ──────────────────────────────────────────
FROM oven/bun:1 AS deps

WORKDIR /app

# Copy workspace root files needed for dependency resolution
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY tsconfig.base.json ./

# Copy package.json files for all workspace packages (for pnpm install)
COPY apps/api/package.json apps/api/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json

# Install pnpm and dependencies
RUN bun install -g pnpm && pnpm install --frozen-lockfile

# ─── Stage 2: Generate Prisma Client ────────────────────────────────────────
FROM deps AS prisma

WORKDIR /app

# Copy Prisma schema
COPY packages/db/prisma packages/db/prisma

# Generate Prisma Client
RUN npx prisma generate --schema=packages/db/prisma/schema.prisma

# ─── Stage 3: Build ─────────────────────────────────────────────────────────
FROM prisma AS build

WORKDIR /app

# Copy source code for all packages the API depends on
COPY packages/shared-types/src packages/shared-types/src
COPY packages/shared-types/tsconfig.json packages/shared-types/tsconfig.json
COPY packages/core/src packages/core/src
COPY packages/core/tsconfig.json packages/core/tsconfig.json
COPY packages/db/src packages/db/src
COPY packages/db/tsconfig.json packages/db/tsconfig.json
COPY apps/api/src apps/api/src
COPY apps/api/tsconfig.json apps/api/tsconfig.json

# Build the API bundle
RUN cd apps/api && bun build src/index.ts --outdir dist --target bun

# ─── Stage 4: Production ────────────────────────────────────────────────────
FROM oven/bun:1-slim AS production

WORKDIR /app

# Don't run as root
RUN addgroup --system --gid 1001 extracker && \
    adduser --system --uid 1001 --ingroup extracker api
USER api

# Copy built output and Prisma engine
COPY --from=build --chown=api:extracker /app/apps/api/dist ./dist
COPY --from=prisma --chown=api:extracker /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=prisma --chown=api:extracker /app/node_modules/@prisma ./node_modules/@prisma

# Environment
ENV NODE_ENV=production
ENV API_PORT=4000

EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:4000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["bun", "run", "dist/index.js"]
