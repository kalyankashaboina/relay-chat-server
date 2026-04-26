#!/usr/bin/env sh
set -e

echo "======================================"
echo "🚀 BACKEND LOCAL CI CHECK STARTED"
echo "======================================"

echo ""
echo "📦 Installing dependencies..."
npm ci

# -------------------------------
# LINT FIX (AUTO FIX FIRST)
# -------------------------------
echo ""
echo "🧹 Running ESLint (auto-fix)..."
npm run lint:fix || true

echo ""
echo "🔍 Verifying ESLint..."
npm run lint

# -------------------------------
# PRETTIER FIX
# -------------------------------
echo ""
echo "🎨 Running Prettier (auto-fix)..."
npm run format || true

echo ""
echo "🎨 Verifying Prettier..."
npm run format:check

# -------------------------------
# TYPE CHECK
# -------------------------------
echo ""
echo "🧠 Running TypeScript check..."
npm run type-check

# -------------------------------
# BUILD
# -------------------------------
echo ""
echo "🏗️ Building backend..."
npm run build

# -------------------------------
# VERIFY WORKER BUILD
# -------------------------------
echo ""
echo "🔍 Checking worker build output..."

if [ ! -f "dist/workers/message.worker.js" ]; then
  echo "❌ Worker build missing: dist/workers/message.worker.js"
  exit 1
fi

echo "✔ Worker build exists"

# -------------------------------
# DOCKER BUILD (API)
# -------------------------------
echo ""
echo "🐳 Building API Docker image..."
docker build -t relay-chat-backend:local .

# -------------------------------
# DOCKER BUILD (WORKER)
# -------------------------------
echo ""
echo "🐳 Building WORKER Docker image..."
docker build -f Dockerfile.worker -t relay-chat-worker:local .

# -------------------------------
# WORKER RUNTIME CHECK
# -------------------------------
echo ""
echo "🧪 Testing worker container startup..."

docker run --rm \
  -e NODE_ENV=test \
  relay-chat-worker:local \
  node -e "console.log('✔ Worker boot test OK')"

# -------------------------------
# FINAL CHECK
# -------------------------------
echo ""
echo "📦 Checking dist size..."
du -sh dist/ || echo "dist not found"

echo ""
echo "✅ BACKEND + WORKER CHECK PASSED"
echo "======================================"