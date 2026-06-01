#!/bin/bash

# Backend Development Startup Script
# MongoDB runs locally (Docker) or via Atlas
# Backend runs on host with hot-reload

echo "===================================="
echo "  Relay Chat Backend Development"
echo "===================================="
echo ""

# Start Docker MongoDB
echo "[1/3] Starting MongoDB in Docker..."
docker-compose -f docker-compose.dev.yml up -d

# Wait for MongoDB to be ready
echo "[2/3] Waiting for MongoDB to be ready..."
sleep 3

# Check if MongoDB is running
if ! docker ps | grep -q "relay-chat-mongo-dev"; then
    echo "ERROR: MongoDB failed to start!"
    echo "Run: docker-compose -f docker-compose.dev.yml logs"
    exit 1
fi

echo "[SUCCESS] MongoDB ready on localhost:27017"
echo ""
echo "MongoDB Setup:"
echo "  - Local: mongodb://localhost:27017/relay-chat"
echo "  - Atlas: Update MONGO_URI in .env for remote database"
echo ""
echo "Current MONGO_URI: $(grep MONGO_URI .env | cut -d'=' -f2)"
echo ""

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "[3/3] Installing dependencies..."
    npm install
else
    echo "[3/3] Dependencies already installed"
fi

echo ""
echo "===================================="
echo "  Starting Backend Server..."
echo "===================================="
echo ""
npm run dev
