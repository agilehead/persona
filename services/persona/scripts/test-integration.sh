#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
case "${1:-local}" in
  local|l) exec npm test ;;
  compose|c) exec node services/persona/scripts/test-containers.mjs ;;
  *) echo "Usage: $0 [local|compose]" >&2; exit 2 ;;
esac
