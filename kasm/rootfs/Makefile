# Rootfs Assembly Makefile
# Assembles rootfs.tar from busybox.wasm and overlay files

ROOTFS_DIR = .
OVERLAY_DIR = overlay
BUILD_DIR = build
BUSYBOX_WASM = ../programs/busybox/busybox.wasm

# Output
ROOTFS_TAR = rootfs.tar
ROOTFS_EXT4 = rootfs.ext4
MKE2FS ?= $(shell command -v mke2fs || command -v mkfs.ext4)
ROOTFS_EXT4_SIZE_MB ?= 64

.PHONY: all clean dirs install-busybox create-tar create-ext4

all: dirs install-busybox create-tar create-ext4
	@echo "Rootfs assembled:"
	@ls -lh $(ROOTFS_TAR) $(ROOTFS_EXT4)

dirs:
	@mkdir -p $(BUILD_DIR)/bin
	@mkdir -p $(BUILD_DIR)/etc
	@mkdir -p $(BUILD_DIR)/tmp
	@mkdir -p $(BUILD_DIR)/dev
	@mkdir -p $(BUILD_DIR)/proc
	@mkdir -p $(BUILD_DIR)/sys
	@mkdir -p $(BUILD_DIR)/home
	@mkdir -p $(BUILD_DIR)/var/run

install-busybox: dirs
	@if [ -f "$(BUSYBOX_WASM)" ]; then \
		echo "Installing busybox.wasm..."; \
		cp $(BUSYBOX_WASM) $(BUILD_DIR)/bin/busybox.wasm; \
		echo "busybox.wasm installed"; \
	else \
		echo "WARNING: $(BUSYBOX_WASM) not found"; \
		echo "Creating placeholder..."; \
		echo "PLACEHOLDER" > $(BUILD_DIR)/bin/busybox.wasm.placeholder; \
	fi

# Copy overlay files (passwd, hostname, etc.)
	@if [ -d "$(OVERLAY_DIR)" ]; then \
		echo "Copying overlay files..."; \
		cp -r $(OVERLAY_DIR)/* $(BUILD_DIR)/ 2>/dev/null || true; \
	fi

# Create essential device nodes (via overlay)
	@echo "Creating essential files..."
	@echo "root:x:0:0:root:/root:/bin/sh" > $(BUILD_DIR)/etc/passwd
	@echo "root:x:0:" > $(BUILD_DIR)/etc/group
	@echo "kasm" > $(BUILD_DIR)/etc/hostname
	@echo "127.0.0.1 localhost kasm" > $(BUILD_DIR)/etc/hosts

# Create init script
	@echo '#!/bin/sh' > $(BUILD_DIR)/init
	@echo 'echo "Kasm WebAssembly Linux"' >> $(BUILD_DIR)/init
	@echo 'echo "====================="' >> $(BUILD_DIR)/init
	@echo 'export PATH=/bin' >> $(BUILD_DIR)/init
	@echo 'export HOME=/home' >> $(BUILD_DIR)/init
	@echo 'export TERM=xterm' >> $(BUILD_DIR)/init
	@echo 'cd /home' >> $(BUILD_DIR)/init
	@echo '/bin/sh' >> $(BUILD_DIR)/init
	@chmod +x $(BUILD_DIR)/init

create-tar: install-busybox
	@echo "Creating $(ROOTFS_TAR)..."
	@cd $(BUILD_DIR) && tar -cf ../$(ROOTFS_TAR) *
	@echo "Rootfs contents:"
	@tar -tf $(ROOTFS_TAR) | head -20
	@echo "... ($(shell tar -tf $(ROOTFS_TAR) | wc -l) total entries)"

create-ext4: install-busybox
	@if [ -z "$(MKE2FS)" ]; then \
		echo "ERROR: mke2fs or mkfs.ext4 not found"; \
		exit 1; \
	fi
	@echo "Creating $(ROOTFS_EXT4)..."
	@rm -f $(ROOTFS_EXT4)
	@dd if=/dev/zero of=$(ROOTFS_EXT4) bs=1M count=$(ROOTFS_EXT4_SIZE_MB) status=none
	@$(MKE2FS) -q -F -d $(BUILD_DIR) -L kasm-root -t ext4 $(ROOTFS_EXT4)
	@echo "Ext4 image contents:"
	@debugfs -R "ls -p /" $(ROOTFS_EXT4) 2>/dev/null | head -20 || true

clean:
	rm -rf $(BUILD_DIR)
	rm -f $(ROOTFS_TAR)
	rm -f $(ROOTFS_EXT4)

help:
	@echo "Rootfs Assembly"
	@echo "==============="
	@echo ""
	@echo "Prerequisites:"
	@echo "  $(BUSYBOX_WASM) - compiled busybox"
	@echo ""
	@echo "Targets:"
	@echo "  all    - Assemble rootfs.tar"
	@echo "  clean  - Remove build artifacts"
	@echo "  help   - Show this help"
