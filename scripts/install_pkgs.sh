#!/bin/bash
# scripts/install_pkgs.sh
# Bootstraps the friscy development environment for Ubuntu 22.04/24.04.
# Includes: RISC-V cross-compilers, Rust (AOT), Go (Proxy), and Emscripten (Runtime).

set -euo pipefail

# Use sudo when not running as root (remote Claude VMs run as root, local dev doesn't)
SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"

echo "=== friscy: Initializing Environment Setup ==="

# 1. System Dependencies
echo "Installing base system packages..."
$SUDO apt-get update
$SUDO apt-get install -y \
    build-essential cmake git python3 nodejs npm xz-utils wget curl jq file xxd \
    ca-certificates gnupg gcc-riscv64-linux-gnu g++-riscv64-linux-gnu

# 2. Docker Engine & Buildx
# Required for friscy-pack and RISC-V container extraction
if ! command -v docker &> /dev/null; then
    echo "Installing Docker Engine..."
    $SUDO install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | $SUDO gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    $SUDO chmod a+r /etc/apt/keyrings/docker.gpg

    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | $SUDO tee /etc/apt/sources.list.d/docker.list > /dev/null

    $SUDO apt-get update
    $SUDO apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin

    # Register QEMU handlers for RISC-V emulation
    $SUDO docker run --rm --privileged multiarch/qemu-user-static --reset -p yes
fi

# 3. Rust Toolchain
# Required for the rv2wasm AOT compiler
if ! command -v cargo &> /dev/null; then
    echo "Installing Rust toolchain..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
fi

# 4. Go Toolchain
# Required for the friscy-proxy (WebTransport bridge)
if ! command -v go &> /dev/null; then
    echo "Installing Go (1.21.6)..."
    GO_VER="1.21.6"
    wget -q "https://go.dev/dl/go${GO_VER}.linux-amd64.tar.gz"
    $SUDO rm -rf /usr/local/go && $SUDO tar -C /usr/local -xzf "go${GO_VER}.linux-amd64.tar.gz"
    rm "go${GO_VER}.linux-amd64.tar.gz"
    
    # Update PATH for current session and bashrc
    export PATH=$PATH:/usr/local/go/bin:$HOME/go/bin
    if ! grep -q "/usr/local/go/bin" "$HOME/.bashrc"; then
        echo 'export PATH=$PATH:/usr/local/go/bin:$HOME/go/bin' >> "$HOME/.bashrc"
    fi
fi

# 5. Emscripten SDK
# Required for the libriscv -> WebAssembly runtime build
EMSDK_DIR="$HOME/emsdk"
if [ ! -d "$EMSDK_DIR" ]; then
    echo "Cloning and installing Emscripten 3.1.50..."
    git clone https://github.com/emscripten-core/emsdk.git "$EMSDK_DIR"
    cd "$EMSDK_DIR"
    ./emsdk install 3.1.50
    ./emsdk activate 3.1.50
    
    # Persistence for future sessions
    if ! grep -q "emsdk_env.sh" "$HOME/.bashrc"; then
        echo "source $EMSDK_DIR/emsdk_env.sh > /dev/null 2>&1" >> "$HOME/.bashrc"
    fi
    cd - > /dev/null
fi

echo "=== friscy: Setup Complete ==="
echo "Please run: source ~/.bashrc"
