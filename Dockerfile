# syntax=docker/dockerfile:1

# ============================================================
# Stage 1: Install dependencies
# ============================================================
FROM node:22-alpine AS dependencies

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci


# ============================================================
# Stage 2: Build Next.js application
# ============================================================
FROM node:22-alpine AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# Copy dependencies
COPY --from=dependencies /app/node_modules ./node_modules

# Copy application source
COPY . .

# Build Next.js
RUN npm run build


# ============================================================
# Stage 3: Production image
# ============================================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Cloud Run requires the application to listen on 0.0.0.0
# and provides PORT=8080 by default.
ENV HOSTNAME=0.0.0.0
ENV PORT=8080


# ============================================================
# Create non-root user
# ============================================================
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs


# ============================================================
# Copy production Next.js files
# ============================================================

# Public assets
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Next.js standalone server
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Next.js static assets
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static


# ============================================================
# Security: run as non-root
# ============================================================
USER nextjs


# ============================================================
# Cloud Run port
# ============================================================
EXPOSE 8080


# ============================================================
# Start Next.js standalone server
# ============================================================
CMD ["node", "server.js"]