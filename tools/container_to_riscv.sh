#!/bin/bash
# container_to_riscv.sh - Extract Docker container as RISC-V rootfs for libriscv
#
# Usage:
#   ./container_to_riscv.sh <image-or-dockerfile> [output-dir]
#
# Examples:
#   ./container_to_riscv.sh alpine:latest ./output
#   ./container_to_riscv.sh ./Dockerfile ./output
#   ./container_to_riscv.sh python:3.11-alpine ./output

set -e

IMAGE_OR_DOCKERFILE="${1:-alpine:latest}"
OUTPUT_DIR="${2:-./container_output}"
PLATFORM="linux/riscv64"

echo "=== friscy: Docker → RISC-V Container Extractor ==="
echo ""

# Check for required tools
check_deps() {
    local missing=()
    command -v docker >/dev/null 2>&1 || missing+=("docker")
    command -v jq >/dev/null 2>&1 || missing+=("jq")

    if [ ${#missing[@]} -ne 0 ]; then
        echo "Error: Missing required tools: ${missing[*]}"
        echo "Install with: apt-get install ${missing[*]}"
        exit 1
    fi

    # Check for buildx
    if ! docker buildx version >/dev/null 2>&1; then
        echo "Error: docker buildx not available"
        echo "Install with: docker buildx install"
        exit 1
    fi
}

# Setup QEMU for RISC-V emulation (needed for buildx)
setup_qemu() {
    echo "[1/6] Setting up QEMU for RISC-V cross-compilation..."

    # Check if RISC-V is already registered
    if [ -f /proc/sys/fs/binfmt_misc/qemu-riscv64 ]; then
        echo "  RISC-V binfmt already registered"
        return 0
    fi

    # Register QEMU handlers
    docker run --rm --privileged multiarch/qemu-user-static --reset -p yes 2>/dev/null || {
        echo "  Warning: Could not register QEMU. Cross-build may fail."
        echo "  Run: docker run --rm --privileged multiarch/qemu-user-static --reset -p yes"
    }
}

# Build or pull image for RISC-V
get_image() {
    local input="$1"
    local image_name

    echo "[2/6] Getting RISC-V image..."

    if [ -f "$input" ]; then
        # It's a Dockerfile - build it
        echo "  Building from Dockerfile: $input"
        image_name="friscy-build:riscv64-$(date +%s)"

        docker buildx build \
            --platform "$PLATFORM" \
            --load \
            -t "$image_name" \
            -f "$input" \
            "$(dirname "$input")"
    else
        # It's an image name - pull it
        echo "  Pulling image: $input"
        image_name="$input"

        docker pull --platform "$PLATFORM" "$image_name"
    fi

    echo "$image_name"
}

# Extract container metadata
extract_metadata() {
    local image="$1"
    local output="$2"

    echo "[3/6] Extracting container metadata..."

    # Create temp container
    local container_id
    container_id=$(docker create --platform "$PLATFORM" "$image" /bin/sh)

    # Get config
    docker inspect "$container_id" > "$output/container_config.json"

    # Extract key fields
    local entrypoint cmd workdir env_vars
    entrypoint=$(jq -r '.[] | .Config.Entrypoint // empty | @json' "$output/container_config.json")
    cmd=$(jq -r '.[] | .Config.Cmd // empty | @json' "$output/container_config.json")
    workdir=$(jq -r '.[] | .Config.WorkingDir // "/" ' "$output/container_config.json")
    env_vars=$(jq -r '.[] | .Config.Env // [] | @json' "$output/container_config.json")

    # Determine actual entrypoint binary
    local entry_binary="/bin/sh"  # default fallback
    if [ -n "$entrypoint" ] && [ "$entrypoint" != "null" ]; then
        entry_binary=$(echo "$entrypoint" | jq -r '.[0] // "/bin/sh"')
    elif [ -n "$cmd" ] && [ "$cmd" != "null" ]; then
        entry_binary=$(echo "$cmd" | jq -r '.[0] // "/bin/sh"')
    fi

    # Write metadata for libriscv
    cat > "$output/metadata.json" << EOF
{
    "entrypoint": $entrypoint,
    "cmd": $cmd,
    "entry_binary": "$entry_binary",
    "workdir": "$workdir",
    "env": $env_vars,
    "platform": "$PLATFORM"
}
EOF

    echo "  Entrypoint: $entry_binary"
    echo "  Workdir: $workdir"

    # Return container ID for cleanup
    echo "$container_id"
}

# Export rootfs
export_rootfs() {
    local container_id="$1"
    local output="$2"

    echo "[4/6] Exporting rootfs..."

    docker export "$container_id" > "$output/rootfs.tar"

    local size
    size=$(du -h "$output/rootfs.tar" | cut -f1)
    echo "  Rootfs size: $size"

    # Also extract to directory for inspection
    mkdir -p "$output/rootfs"
    tar -xf "$output/rootfs.tar" -C "$output/rootfs"

    # Cleanup container
    docker rm "$container_id" > /dev/null
}

# Find the actual entry binary in rootfs
find_entry_binary() {
    local rootfs="$1"
    local entry="$2"

    echo "[5/6] Locating entry binary..."

    local binary_path="$rootfs$entry"

    # Handle busybox symlinks
    if [ -L "$binary_path" ]; then
        local target
        target=$(readlink "$binary_path")
        if [[ "$target" == *"busybox"* ]]; then
            echo "  Entry is busybox symlink: $entry -> $target"
            binary_path="$rootfs/bin/busybox"
        fi
    fi

    if [ -f "$binary_path" ]; then
        # Verify it's a RISC-V binary
        local file_type
        file_type=$(file "$binary_path")
        if [[ "$file_type" == *"RISC-V"* ]]; then
            echo "  Found RISC-V binary: $binary_path"

            # Check if static or dynamic
            if [[ "$file_type" == *"statically linked"* ]]; then
                echo "  Linking: static (ideal for libriscv)"
            else
                echo "  Linking: dynamic (requires ld-linux emulation)"

                # Find interpreter
                local interp
                interp=$(readelf -l "$binary_path" 2>/dev/null | grep "interpreter:" | sed 's/.*: //' | tr -d ']')
                if [ -n "$interp" ]; then
                    echo "  Interpreter: $interp"
                fi
            fi
        else
            echo "  Warning: Not a RISC-V binary: $file_type"
        fi
    else
        echo "  Warning: Entry binary not found: $binary_path"
    fi
}

# Generate C header with embedded rootfs (for small containers)
generate_embedded() {
    local output="$1"

    echo "[6/6] Generating embeddable rootfs..."

    local tar_size
    tar_size=$(stat -f%z "$output/rootfs.tar" 2>/dev/null || stat -c%s "$output/rootfs.tar")

    # Only embed if < 10MB
    if [ "$tar_size" -lt 10485760 ]; then
        echo "  Generating rootfs_data.h (embedded tar)..."

        xxd -i "$output/rootfs.tar" > "$output/rootfs_data.h"
        sed -i 's/.*rootfs_tar/const unsigned char rootfs_tar/' "$output/rootfs_data.h"
        sed -i 's/unsigned int.*len/const unsigned int rootfs_tar_len/' "$output/rootfs_data.h"

        echo "  Generated: $output/rootfs_data.h"
    else
        echo "  Rootfs too large for embedding ($tar_size bytes)"
        echo "  Use HTTP fetch or 9P streaming instead"
    fi

    # Generate metadata header
    cat > "$output/container_meta.h" << 'EOF'
// Auto-generated container metadata
#pragma once

EOF

    # Add metadata from JSON
    local entry workdir
    entry=$(jq -r '.entry_binary' "$output/metadata.json")
    workdir=$(jq -r '.workdir' "$output/metadata.json")

    cat >> "$output/container_meta.h" << EOF
static constexpr const char* CONTAINER_ENTRY = "$entry";
static constexpr const char* CONTAINER_WORKDIR = "$workdir";

// Environment variables
static const char* CONTAINER_ENV[] = {
EOF

    jq -r '.env[]' "$output/metadata.json" | while read -r env; do
        echo "    \"$env\"," >> "$output/container_meta.h"
    done

    echo "    nullptr" >> "$output/container_meta.h"
    echo "};" >> "$output/container_meta.h"
}

# Main
main() {
    check_deps

    mkdir -p "$OUTPUT_DIR"

    setup_qemu

    local image_name
    image_name=$(get_image "$IMAGE_OR_DOCKERFILE")

    local container_id
    container_id=$(extract_metadata "$image_name" "$OUTPUT_DIR" | tail -1)

    export_rootfs "$container_id" "$OUTPUT_DIR"

    local entry_binary
    entry_binary=$(jq -r '.entry_binary' "$OUTPUT_DIR/metadata.json")
    find_entry_binary "$OUTPUT_DIR/rootfs" "$entry_binary"

    generate_embedded "$OUTPUT_DIR"

    echo ""
    echo "=== Done! ==="
    echo "Output directory: $OUTPUT_DIR"
    echo ""
    echo "Contents:"
    ls -la "$OUTPUT_DIR"/*.{tar,json,h} 2>/dev/null || true
    echo ""
    echo "Next steps:"
    echo "  1. Copy rootfs_data.h and container_meta.h to friscy/"
    echo "  2. Build with: ./harness.sh"
    echo "  3. Run with: node test_node.js"
}

main "$@"
