#!/bin/bash

# Start script for Persona server
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Check if we're in Docker (scripts in /app/scripts)
if [ -f "/app/node/packages/persona-server/dist/bin/server.js" ]; then
    cd /app/node/packages/persona-server
elif [ -d "$SCRIPT_DIR/../node/packages/persona-server" ]; then
    cd "$SCRIPT_DIR/../node/packages/persona-server"
else
    echo "Error: Cannot find persona-server package"
    exit 1
fi

# Start the server
node dist/bin/server.js
