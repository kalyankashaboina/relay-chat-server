# ================================
# STAGE 1: Build
# ================================
FROM node:20-alpine AS builder

WORKDIR /app

ENV HUSKY=0

# Install deps (cached layer)
COPY package*.json ./
RUN npm ci

# Copy source
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build


# ================================
# STAGE 2: Runtime
# ================================
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV HUSKY=0

# Install only production deps
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy compiled output
COPY --from=builder /app/dist ./dist

# 🔒 Create non-root user + set permissions
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

# 🌐 Expose port
EXPOSE 4000

# clear
#  Healthcheck (fast + safe)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', res => process.exit(res.statusCode===200?0:1)).on('error', () => process.exit(1))"

# 🚀 Start app
CMD ["node", "dist/server.js"]