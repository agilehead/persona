#!/bin/bash

# Docker build script for Persona
# Builds two targets: persona-migrations, persona (production)
# Usage: ./docker-build.sh [tag]

set -euo pipefail
cd "$(dirname "$0")/../../.."

# Default values
DEFAULT_TAG="latest"
TAG="${1:-$DEFAULT_TAG}"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Building Persona Docker images...${NC}"

# Get git commit hash for labeling
GIT_COMMIT=$(git rev-parse HEAD)
GIT_TAG=$(git rev-parse --short HEAD)
SOURCE_DIRTY=false
if [ -n "$(git status --porcelain)" ]; then SOURCE_DIRTY=true; fi
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

build_image() {
  local target="$1"
  local image_name="$2"
  local dockerfile="$3"

  echo -e "${YELLOW}Building image: ${image_name}:${TAG} (target: ${target})${NC}"
  docker buildx build --load \
    -f "${dockerfile}" \
    --target "${target}" \
    --build-arg GIT_COMMIT="${GIT_COMMIT}" \
    --build-arg BUILD_DATE="${BUILD_DATE}" \
    --label "git.commit=${GIT_COMMIT}" \
    --label "org.opencontainers.image.revision=${GIT_COMMIT}" \
    --label "source.dirty=${SOURCE_DIRTY}" \
    --label "build.date=${BUILD_DATE}" \
    -t "${image_name}:${TAG}" \
    .

  if [ "$SOURCE_DIRTY" = false ]; then docker tag "${image_name}:${TAG}" "${image_name}:${GIT_TAG}"; fi
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}Successfully built ${image_name}:${TAG}${NC}"
  else
    echo -e "${RED}Failed to build ${image_name}:${TAG}${NC}"
    exit 1
  fi
}

# Build migrations image
build_image "migrations" "persona-migrations" "services/persona/database/Dockerfile"

# Build production image
build_image "nativeaot" "persona" "services/persona/csharp/Dockerfile"

# Show image info
echo -e "\n${YELLOW}Image details:${NC}"
docker images "persona*" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}" | head -5

echo -e "${GREEN}All images built successfully!${NC}"
