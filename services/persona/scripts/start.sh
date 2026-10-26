#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
exec node services/persona/scripts/start.mjs "${1:-csharp}"
