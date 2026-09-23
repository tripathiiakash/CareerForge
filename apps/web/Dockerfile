# ==============================================================================
# CareerForge Web — Production Multi-Stage Dockerfile
# Base: Node 22 Alpine (Build) -> Nginx Alpine (Runtime)
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build & Compilation
# ------------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package manifests for dependency resolution
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/config/package.json ./packages/config/
COPY packages/types/package.json ./packages/types/
COPY packages/ui/package.json ./packages/ui/
COPY packages/validation/package.json ./packages/validation/

RUN npm ci

# Copy configuration and web application source code
COPY turbo.json tsconfig.json ./
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/

# Accept build-time API base URL argument (defaults to relative /api/v1 for reverse proxy routing)
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL

# Build the Vite production bundle
RUN npm run build --workspace=@careerforge/web

# ------------------------------------------------------------------------------
# Stage 2: Production Nginx Runtime
# ------------------------------------------------------------------------------
FROM nginx:alpine AS runner

# Remove default Nginx welcome page
RUN rm -rf /usr/share/nginx/html/*

# Copy custom optimized Nginx configuration
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# Copy Vite build output from builder stage
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

# Container liveness check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1/nginx-health || exit 1

CMD ["nginx", "-g", "daemon off;"]
