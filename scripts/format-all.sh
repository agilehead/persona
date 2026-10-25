#!/usr/bin/env bash
# -------------------------------------------------------------------
# format-all.sh – Run prettier across all TypeScript and JavaScript files
# -------------------------------------------------------------------
set -euo pipefail

# Change to the project root directory
cd "$(dirname "$0")/.."

echo "=== Formatting Persona ==="

# Source and tests follow the product's implementation owner.
./node_modules/.bin/prettier --write --ignore-unknown --no-error-on-unmatched-pattern \
  "*.json" "scripts/*.mjs" \
  "services/persona/node/{apps,packages}/*/src/**/*.ts" \
  "services/persona/node/{apps,packages}/*/package.json" \
  "services/persona/node/packages/*/tests/**/*.ts" \
  "services/persona/node/tests/**/*.ts" \
  "services/persona/**/*.mjs"

echo "=== Formatting completed ==="
