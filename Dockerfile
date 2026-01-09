# ================================
# Build stage
# ================================
FROM node:20-alpine AS builder

WORKDIR /app

# Disable husky completely inside Docker
ENV HUSKY=0

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ================================
# Runtime stage
# ================================
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV HUSKY=0

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/server.js"]
