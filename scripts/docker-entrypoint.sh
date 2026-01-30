#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting Persona OAuth Server...${NC}"

# Function to run migrations
run_migrations() {
    echo -e "${YELLOW}Running database migrations...${NC}"
    cd /app

    if npm run migrate:latest; then
        echo -e "${GREEN}Migrations completed successfully!${NC}"
        return 0
    else
        echo -e "${RED}Migration failed!${NC}"
        return 1
    fi
}

# Main logic
cd /app

# Check if auto-migration is enabled
if [ "${PERSONA_AUTO_MIGRATE}" = "true" ]; then
    echo -e "${YELLOW}Auto-migration is enabled${NC}"

    if ! run_migrations; then
        echo -e "${RED}Failed to run migrations. Exiting.${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}Auto-migration is disabled. Set PERSONA_AUTO_MIGRATE=true to enable.${NC}"
fi

# Start the application
echo -e "${GREEN}Starting Persona server on port ${PERSONA_SERVER_PORT:-5005}...${NC}"
cd /app
exec ./start.sh
