# Busybox Emscripten Build Makefile
# 
# Uses Emscripten's built-in musl which provides __syscall_* functions.
# We provide the __syscall_* imports that route to our SAB-based kernel.
#
# This avoids the syscall number mismatch issue between x86_64 and asm-generic.
# Emscripten's musl uses named syscall functions, not raw numbers.

BUSYBOX_DIR = busybox
BUILD_DIR = build

# Emscripten toolchain
EMSDK_DIR = ../../emsdk
EMCC = $(EMSDK_DIR)/upstream/emscripten/emcc
EMCXX = $(EMSDK_DIR)/upstream/emscripten/em++
EMCONFIGURE = $(EMSDK_DIR)/upstream/emscripten/emconfigure
EMMAKE = $(EMSDK_DIR)/upstream/emscripten/emmake

# Emscripten flags - we need to provide __syscall_* imports
# Key flags:
#   -sALLOW_MEMORY_GROWTH=1: Dynamic memory
#   -sEXPORTED_FUNCTIONS: Export the syscalls we handle
#   -sIMPORTED_MEMORY: Import memory from JS
#   -sSHARED_MEMORY: Enable SharedArrayBuffer
#   -pthread: Enable pthreads

CFLAGS = -O2 -g \
	-D__EMSCRIPTEN__ \
	-D__linux__ \
	-D__unix__ \
	-DHAVE_C CONFIG_H \
	-DSTATIC \
	-fvisibility=hidden \
	-Wall -Wshadow -Wwrite-strings \
	-I$(BUSYBOX_DIR)/include

LDFLAGS = -O2 -g \
	-sALLOW_MEMORY_GROWTH=1 \
	-sMAXIMUM_MEMORY=4GB \
	-sINITIAL_MEMORY=16MB \
	-sSTACK_SIZE=1MB \
	-sEXPORTED_FUNCTIONS="['_main','_start','___syscall_openat','___syscall_read','___syscall_write','___syscall_close','___syscall_brk','___syscall_mmap2','___syscall_munmap','___syscall_ioctl','___syscall_fcntl64','___syscall_dup','___syscall_dup3','___syscall_pipe2','___syscall_getcwd','___syscall_chdir','___syscall_mkdirat','___syscall_unlinkat','___syscall_renameat','___syscall_newfstatat','___syscall_fstat64','___syscall_clock_gettime','___syscall_getpid','___syscall_getppid','___syscall_exit','___syscall_exit_group','___syscall_wait4','___syscall_getrandom','___syscall_uname']" \
	-sEXPORTED_RUNTIME_METHODS="['ccall','cwrap','UTF8ToString','stringToUTF8','lengthBytesUTF8','getTempRet0','setTempRet0']" \
	-sMODULARIZE=1 \
	-sEXPORT_NAME="'BusyboxModule'" \
	-sIMPORTED_MEMORY=1 \
	-sSHARED_MEMORY=1 \
	-pthread \
	-sPTHREAD_POOL_SIZE=1 \
	-sERROR_ON_UNDEFINED_SYMBOLS=0 \
	-sWARN_ON_UNDEFINED_SYMBOLS=1 \
	-sASSERTIONS=1 \
	--js-library ../../middleware/emscripten_syscalls.js

# Output
BUSYBOX_WASM = busybox.wasm
BUSYBOX_JS = busybox.js

.PHONY: all clean configure build test

all: configure build

# Configure busybox for Emscripten
configure:
	@echo "Configuring busybox for Emscripten..."
	cd $(BUSYBOX_DIR) && \
	$(EMCONFIGURE) ./configure \
		--host=wasm32 \
		--build=$(shell gcc -dumpmachine) \
		--prefix=/ \
		--enable-static \
		--disable-shared \
		--disable-nls \
		--disable-iconv \
		--disable-locale-support \
		--disable-werror \
		--enable-small-optimization \
		--enable-feature-sh-external-commands \
		--enable-feature-prefer-applets \
		--disable-feature-mount-fancy \
		--disable-feature-mount-help \
		--disable-feature-mount-label \
		--disable-feature-mount-nfs \
		--disable-feature-mount-cifs \
		--disable-ifplugd \
		--disable-inetd \
		--disable-init \
		--disable-linuxrc \
		--disable-shell-ash-job-control \
		--disable-hush \
		--disable-hush-job \
		--disable-lash \
		--disable-sendmail \
		--disable-mdev \
		--disable-modprobe \
		--disable-depmod \
		--disable-pivot_root \
		--disable-swaponoff \
		--disable-umount \
		--disable-blkid \
		--disable-volumeid \
		--disable-feature-utmp \
		--disable-feature-wtmp \
		--disable-login \
		--disable-su \
		--disable-sulogin \
		--disable-passwd \
		--disable-crypt \
		--disable-dc \
		--disable-bc \
		--disable-rpm \
		--disable-rpm2cpio \
		--disable-dpkg \
		--disable-dpkg-deb \
		--disable-ftpget \
		--disable-ftpput \
		--disable-tftp \
		--disable-telnet \
		--disable-feature-telnetd \
		--disable-nc \
		--disable-dnsd \
		--disable-udhcpd \
		--disable-udhcpc \
		--disable-dhcprelay \
		--disable-dhcpd \
		--disable-dhcpc \
		--disable-crond \
		--disable-crontab \
		--disable-httpd \
		--disable-inetd \
		--disable-ftpget \
		--disable-ftpput \
		--disable-tftp \
		--disable-telnet \
		--disable-wget \
		2>&1 | tee ../configure.log || true
	@echo "Configure complete (errors expected on first run)"

# Build busybox
build: configure
	@echo "Building busybox.wasm..."
	$(EMMAKE) make -C $(BUSYBOX_DIR) \
		CC="$(EMCC)" \
		CFLAGS="$(CFLAGS)" \
		LDFLAGS="$(LDFLAGS)" \
		HOSTCC=gcc \
		CONFIG_STATIC=y \
		CONFIG_CROSS_COMPILER_PREFIX="" \
		CONFIG_PREFIX="" \
		busybox \
		2>&1 | tee build.log || true
	
	@if [ -f "$(BUSYBOX_DIR)/busybox" ]; then \
		cp $(BUSYBOX_DIR)/busybox $(BUSYBOX_WASM); \
		echo "Built: $(BUSYBOX_WASM)"; \
		ls -lh $(BUSYBOX_WASM); \
	else \
		echo "Build may have failed - check build.log"; \
		exit 1; \
	fi

# Create minimal config
config:
	@echo "Creating minimal busybox .config..."
	cd $(BUSYBOX_DIR) && make defconfig
	@echo "CONFIG_STATIC=y" >> $(BUSYBOX_DIR)/.config
	@echo "CONFIG_FEATURE_SH_STANDALONE=y" >> $(BUSYBOX_DIR)/.config
	@echo "CONFIG_FEATURE_PREFER_APPLETS=y" >> $(BUSYBOX_DIR)/.config
	@echo "CONFIG_SH=y" >> $(BUSYBOX_DIR)/.config
	@echo "CONFIG_ECHO=y" >> $(BUSYBOX_DIR)/.config
	@echo "CONFIG_CAT=y" >> $(BUSYBOX_DIR)/.config
	@echo "CONFIG_LS=y" >> $(BUSYBOX_DIR)/.config
	@echo "CONFIG_PWD=y" >> $(BUSYBOX_DIR)/.config
	@echo "CONFIG_MKDIR=y" >> $(BUSYBOX_DIR)/.config
	@echo "CONFIG_RM=y" >> $(BUSYBOX_DIR)/.config
	@echo "CONFIG_CP=y" >> $(BUSYBOX_DIR)/.config
	@echo "CONFIG_MV=y" >> $(BUSYBOX_DIR)/.config
	@echo "CONFIG_CHMOD=y" >> $(BUSYBOX_DIR)/.config
	@echo "CONFIG_GREP=y" >> $(BUSYBOX_DIR)/.config
	@echo "CONFIG_SED=y" >> $(BUSYBOX_DIR)/.config
	@echo "CONFIG_AWK=y" >> $(BUSYBOX_DIR)/.config
	@echo "CONFIG_HEAD=y" >> $(BUSYBOX_DIR)/.config
	@echo "CONFIG_TAIL=y" >> $(BUSYBOX_DIR)/.config
	@echo "CONFIG_WC=y" >> $(BUSYBOX_DIR)/.config
	@echo "CONFIG_SORT=y" >> $(BUSYBOX_DIR)/.config
	@echo "CONFIG_UNIQ=y" >> $(BUSYBOX_DIR)/.config
	@echo "CONFIG_TEST=y" >> $(BUSYBOX_DIR)/.config
	@echo "CONFIG_TRUE=y" >> $(BUSYBOX_DIR)/.config
	@echo "CONFIG_FALSE=y" >> $(BUSYBOX_DIR)/.config
	@echo "CONFIG_SLEEP=y" >> $(BUSYBOX_DIR)/.config
	@echo "CONFIG_ENV=y" >> $(BUSYBOX_DIR)/.config
	@echo "CONFIG_PRINTF=y" >> $(BUSYBOX_DIR)/.config
	@echo "CONFIG_SEQ=y" >> $(BUSYBOX_DIR)/.config
	@echo "CONFIG_XARGS=y" >> $(BUSYBOX_DIR)/.config
	@echo "CONFIG_FIND=y" >> $(BUSYBOX_DIR)/.config
	@echo "CONFIG_TOUCH=y" >> $(BUSYBOX_DIR)/.config
	@echo "CONFIG_DD=y" >> $(BUSYBOX_DIR)/.config
	@echo "CONFIG_PIPE=y" >> $(BUSYBOX_DIR)/.config
	cd $(BUSYBOX_DIR) && make oldconfig

clean:
	rm -f $(BUSYBOX_WASM) $(BUSYBOX_JS) configure.log build.log
	rm -rf $(BUILD_DIR)
	$(EMMAKE) make -C $(BUSYBOX_DIR) clean 2>/dev/null || true

help:
	@echo "Busybox Emscripten Build"
	@echo "========================"
	@echo ""
	@echo "Targets:"
	@echo "  all          - Configure and build"
	@echo "  configure    - Run emconfigure"
	@echo "  build        - Compile busybox.wasm"
	@echo "  config       - Create minimal .config"
	@echo "  clean        - Remove build artifacts"
	@echo "  help         - Show this help"
	@echo ""
	@echo "Emscripten's musl uses __syscall_* functions (not raw numbers)."
	@echo "We provide these imports via middleware/emscripten_syscalls.js"
	@echo ""
	@echo "Output: $(BUSYBOX_WASM)"
