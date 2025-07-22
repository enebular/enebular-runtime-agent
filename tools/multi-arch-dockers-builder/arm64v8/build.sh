#!/bin/bash
set -e

# Setup buildx for multi-platform builds
docker buildx create --name multiarch --use --bootstrap || docker buildx use multiarch

# Build and push with platform specification
docker buildx build --platform linux/arm64 \
  -t enebularagentdevelopers/enebular-agent-arm64v8:node-22.17.1 \
  --push .


