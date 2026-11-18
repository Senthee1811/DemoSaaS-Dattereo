# ==============================================================================
# SpendGuard AI — Production NestJS Backend Dockerfile
# Multi-stage build for minimal image size, zero devDependencies, and security.
# ==============================================================================

# Stage 1: Build & Compile
FROM node:20-alpine AS builder
WORKDIR /app

# Install build tools needed for native node modules
RUN apk add --no-cache python3 make g++

# Copy dependency manifests
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies for TypeScript build)
RUN npm ci

# Generate Prisma Client
RUN npx prisma generate

# Copy source code and config
COPY tsconfig*.json nest-cli.json ./
COPY src ./src/

# Compile TypeScript to dist/
RUN npm run build

# Prune devDependencies to keep production image light
RUN npm prune --production

# ==============================================================================
# Stage 2: Production Runtime
FROM node:20-alpine AS runner
WORKDIR /app

# Install curl for container health checks
RUN apk add --no-cache curl

# Security: Create non-root system user and group
RUN addgroup --system --gid 1001 spendguard && \
    adduser --system --uid 1001 spendguard -G spendguard

ENV NODE_ENV=production
ENV PORT=4000

# Copy runtime files from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Set correct non-root ownership
RUN chown -R spendguard:spendguard /app

USER spendguard

EXPOSE 4000

# Health check probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:4000/api/health || exit 1

# nest build emits dist/src/main.js (tsconfig includes src/, test/ and prisma/).
# Apply pending migrations before boot so a fresh database is always usable.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
