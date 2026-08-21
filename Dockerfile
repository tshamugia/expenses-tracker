FROM node:22-alpine AS base

# Dependencies
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps

# Builder
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

# Public build-time var: inlined into the client bundle by Next.js.
# Safe to expose (it is a public VAPID key). Must match VAPID_PUBLIC_KEY at runtime.
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY

# Generate Prisma Client before building
RUN npx prisma generate

RUN npm run build

# Runner
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# openssl is required by the Prisma engines (client + migration engine) on alpine
RUN apk add --no-cache openssl

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set proper permissions
RUN mkdir .next
RUN chown nextjs:nodejs .next

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma schema + migrations for the pre-deploy migration step.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Copy the FULL node_modules from the builder (it already contains the generated
# Prisma client from `prisma generate`). The standalone output above ships a
# trimmed node_modules that lacks the Prisma CLI and its transitive deps
# (e.g. `effect` via @prisma/config), so the Railway pre-deploy command
# `node node_modules/prisma/build/index.js migrate deploy` needs the complete
# tree. This overlays (superset) the trimmed one the app runtime uses.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]