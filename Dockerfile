# ================================
# STAGE 1: Build (TypeScript → JS)
# ================================
FROM node:20-alpine AS builder

WORKDIR /app

# Disable husky & scripts in Docker
ENV HUSKY=0

# Install deps exactly from lockfile
COPY package*.json ./
RUN npm ci

# Copy source & config
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build


# ================================
# STAGE 2: Runtime (Production)
# ================================
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV HUSKY=0

# Install ONLY production deps, ignore scripts
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy compiled output
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/server.js"]
