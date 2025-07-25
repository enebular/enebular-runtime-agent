#!/bin/bash
set -e

echo "Building all Docker images..."

echo "Building x64..."
cd x64 && ./build.sh
cd ..

echo "Building arm32v7..."
cd arm32v7 && ./build.sh
cd ..

echo "Building arm64v8..."
cd arm64v8 && ./build.sh
cd ..

echo "All builds completed!"