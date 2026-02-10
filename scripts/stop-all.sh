#!/bin/bash

# Stop all Persona services (local processes and docker containers)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Stopping all Persona services..."

# Stop docker-compose services
echo "Stopping Docker Compose services..."
if [ -f "$ROOT_DIR/devenv/docker-compose.yml" ]; then
  docker compose -f "$ROOT_DIR/devenv/docker-compose.yml" down 2>/dev/null || true
fi

# Kill any local node processes related to persona
echo "Stopping local Node.js processes..."
pkill -f "node.*persona" 2>/dev/null || true

# Free up persona port (5005) and test port (5015)
echo "Freeing ports 5005, 5015..."
for port in 5005 5015; do
  lsof -ti:$port 2>/dev/null | xargs kill -9 2>/dev/null || true
done

# Wait for processes to terminate
sleep 2

echo "All Persona services stopped"
