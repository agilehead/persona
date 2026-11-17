#!/bin/bash
# Publish the application and its unchanged Knex migration runner to GHCR.
# Usage: ./services/persona/scripts/docker-push.sh [tag]
set -euo pipefail
cd "$(dirname "$0")/../../.."

TAG="${1:-latest}"
if [ -n "$(git status --porcelain)" ]; then
  echo "Commit the reviewed release source before publishing images" >&2; exit 2
fi
GIT_COMMIT=$(git rev-parse --short HEAD)
GIT_REVISION=$(git rev-parse HEAD)
IMAGES=(persona persona-migrations)

# Check the complete release before publishing either image.
for image in "${IMAGES[@]}"; do
  identity=$(docker image inspect --format '{{index .Config.Labels "git.commit"}}|{{index .Config.Labels "source.dirty"}}' "$image:$TAG")
  if [ "$identity" != "$GIT_REVISION|false" ]; then
    echo "Image $image:$TAG does not match clean release source" >&2; exit 2
  fi
done

for image in "${IMAGES[@]}"; do
  remote="ghcr.io/agilehead/$image"
  docker tag "$image:$TAG" "$remote:$GIT_COMMIT"
  docker push "$remote:$GIT_COMMIT"
  docker tag "$image:$TAG" "$remote:$TAG"
  docker push "$remote:$TAG"
done
