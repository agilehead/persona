#!/bin/bash
# Publish the application and its unchanged Knex migration runner to GHCR.
# Usage: ./services/persona/scripts/docker-push.sh [tag]
set -euo pipefail
cd "$(dirname "$0")/../../.."

TAG="${1:-latest}"
GIT_COMMIT=$(git rev-parse --short HEAD)
IMAGES=(persona persona-migrations)

# Check the complete release before publishing either image.
for image in "${IMAGES[@]}"; do
  docker image inspect "$image:$TAG" >/dev/null
done

for image in "${IMAGES[@]}"; do
  remote="ghcr.io/agilehead/$image"
  docker tag "$image:$TAG" "$remote:$GIT_COMMIT"
  docker push "$remote:$GIT_COMMIT"
  docker tag "$image:$TAG" "$remote:$TAG"
  docker push "$remote:$TAG"
done
