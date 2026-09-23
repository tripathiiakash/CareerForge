# ==============================================================================
# CareerForge API — Production Multi-Stage Dockerfile
# Base: Node.js 22 Alpine (minimal footprint, non-root execution)
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build & Compilation
# ------------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Install native dependencies required for Prisma engine compilation & Alpine compatibility
RUN apk add --no-cache libc6-compat openssl

# Copy package manifests for workspace caching
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/config/package.json ./packages/config/
COPY packages/types/package.json ./packages/types/
COPY packages/ui/package.json ./packages/ui/
COPY packages/validation/package.json ./packages/validation/

# Install all dependencies (including devDependencies required for compilation)
RUN npm ci

# Copy configuration, shared packages, and API source code
COPY turbo.json tsconfig.json ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

# Generate Prisma Client engine
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma

# Build the NestJS API application bundle
RUN npm run build --workspace=@careerforge/api

# ------------------------------------------------------------------------------
# Stage 2: Production Dependencies Pruning
# ------------------------------------------------------------------------------
FROM node:22-alpine AS pruner

WORKDIR /app

RUN apk add --no-cache libc6-compat openssl

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/config/package.json ./packages/config/
COPY packages/types/package.json ./packages/types/
COPY packages/validation/package.json ./packages/validation/

# Install only production dependencies for the API workspace
RUN npm ci --omit=dev --workspace=@careerforge/api --include-workspace-root

# Copy schema and generate production Prisma Client in the pruned node_modules
COPY apps/api/prisma ./apps/api/prisma
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma

# ------------------------------------------------------------------------------
# Stage 3: Minimal Production Runtime
# ------------------------------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=5000

# Install dumb-init for graceful PID 1 signal forwarding (SIGTERM / SIGINT) and OpenSSL for Prisma
RUN apk add --no-cache dumb-init openssl

# Switch to the default non-root 'node' user provided by Node Alpine
USER node

# Copy production node_modules from pruner
COPY --chown=node:node --from=pruner /app/node_modules ./node_modules

# Copy workspace packages referenced at runtime
COPY --chown=node:node --from=builder /app/packages ./packages

# Copy compiled NestJS application and Prisma schema
COPY --chown=node:node --from=builder /app/apps/api/dist ./apps/api/dist
COPY --chown=node:node --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --chown=node:node --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --chown=node:node --from=builder /app/package.json ./package.json

EXPOSE 5000

# Container liveness check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:5000/api/v1/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Use dumb-init to ensure signals are properly forwarded to Node
ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "apps/api/dist/main.js"]
