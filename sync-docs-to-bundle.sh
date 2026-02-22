#!/bin/bash
# Sync docs_site to friscy-bundle for GitHub Pages deployment
# This ensures friscy-bundle always has the latest files from docs_site

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Syncing docs_site to friscy-bundle..."

# Copy all HTML files
echo "  - HTML files..."
cp docs_site/*.html friscy-bundle/ 2>/dev/null || true

# Copy all SVG, PNG, and JPG files
echo "  - Image files..."
cp docs_site/*.svg friscy-bundle/ 2>/dev/null || true
cp docs_site/*.png friscy-bundle/ 2>/dev/null || true
cp docs_site/*.jpg friscy-bundle/ 2>/dev/null || true

# Copy manifest.json
echo "  - manifest.json..."
cp docs_site/manifest.json friscy-bundle/ 2>/dev/null || true

# Copy JavaScript and WASM files (but exclude large checkpoint/tar files)
echo "  - JavaScript and WASM files..."
for file in docs_site/*.js docs_site/*.wasm; do
    if [ -f "$file" ]; then
        basename_file=$(basename "$file")
        # Skip if it's a large file (checkpoints/tars)
        if [ "$basename_file" != "*.ckpt" ] && [ "$basename_file" != "*.tar" ]; then
            cp "$file" friscy-bundle/
        fi
    fi
done

# Sync dist folder
if [ -d "docs_site/dist" ]; then
    echo "  - dist/ folder..."
    mkdir -p friscy-bundle/dist
    cp docs_site/dist/* friscy-bundle/dist/ 2>/dev/null || true
fi

echo "Sync complete!"
echo ""
echo "Files ready for GitHub Pages deployment in friscy-bundle/"
