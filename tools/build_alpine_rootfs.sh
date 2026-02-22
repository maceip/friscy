#!/bin/bash
set -e

# Build the riscv64 alpine image
docker build --network host --platform linux/riscv64 -t friscy-alpine-opt -f tools/Dockerfile.optimized-alpine .

# Create a container from the image to export its filesystem
CID=$(docker create friscy-alpine-opt)

# Export the filesystem as a tarball to both locations
docker export $CID > docs_site/rootfs.tar
cp docs_site/rootfs.tar friscy-bundle/rootfs.tar

# Clean up the container
docker rm $CID

echo "Successfully built and exported optimized Alpine rootfs."
