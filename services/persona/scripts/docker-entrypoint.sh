#!/bin/bash
set -e

echo "Starting Persona OAuth Server..."

# Ensure data directory exists for SQLite
mkdir -p "${PERSONA_DATA_DIR:-/app/data}"

# Start the application
exec node services/persona/node/apps/server/dist/bin/server.js
