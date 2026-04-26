# ================================
# STAGE 1: Build
# ================================
FROM node:20-alpine AS builder

WORKDIR /app

ENV HUSKY=0

# Install deps (cache layer)
COPY package*.json ./
RUN npm ci

# Copy source
COPY tsconfig.json ./
COPY src ./src

# Build
RUN npm run build


# ================================
# STAGE 2: Runtime
# ================================
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV HUSKY=0

# Install production deps
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy build
COPY --from=builder /app/dist ./dist

# Security: non-root user
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs
USER nodejs

# Port
EXPOSE 4000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', res => process.exit(res.statusCode===200?0:1)).on('error', () => process.exit(1))"

# Start API
CMD ["node", "dist/server.js"]