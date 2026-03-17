#include "bootstrap.h"

#include <lkl_host.h>
#include <stdio.h>
#include <string.h>

long kasm_sys_mkdirat(int dfd, const char *pathname, unsigned int mode);
long kasm_sys_faccessat(int dfd, const char *filename, int mode);
long kasm_sys_openat(int dfd, const char *filename, int flags, unsigned int mode);
long kasm_sys_close(unsigned int fd);
long kasm_sys_read(unsigned int fd, char *buf, size_t count);
long kasm_sys_write(unsigned int fd, const char *buf, size_t count);
long kasm_sys_mount(char *dev_name, char *dir_name, char *type,
                    unsigned long flags, void *data);

int kasm_root_disk_ready(void);
int kasm_virtio_force_init(void);
int kasm_bio_force_init(void);
int kasm_genhd_force_init(void);
int kasm_virtio_mmio_force_init(void);
int kasm_virtio_blk_force_init(void);
int kasm_virtio_mmio_force_register(const char *device);
int kasm_crc32c_force_init(void);
int kasm_mbcache_force_init(void);
int kasm_jbd2_force_init(void);
int kasm_ext4_force_init(void);

extern char lkl_virtio_devs[];

#define KASM_LKL_AT_FDCWD -100
#define KASM_LKL_O_RDONLY 00
#define KASM_LKL_O_WRONLY 01
#define KASM_LKL_O_CREAT  0100
#define KASM_LKL_F_OK 0

static void log_syscall_result(const char *label, long ret)
{
    printf("  %s: %ld\n", label, ret);
}

static long lkl_sys_mkdir(const char *path, unsigned int mode)
{
    return kasm_sys_mkdirat(KASM_LKL_AT_FDCWD, path, mode);
}

static long lkl_sys_mount(const char *dev_name, const char *dir_name,
                          const char *type, unsigned long flags, void *data)
{
    return kasm_sys_mount((char *)dev_name, (char *)dir_name, (char *)type,
                          flags, data);
}

static long lkl_sys_open(const char *file, int flags, int mode)
{
    return kasm_sys_openat(KASM_LKL_AT_FDCWD, file, flags, mode);
}

static long lkl_sys_close(int fd)
{
    return kasm_sys_close(fd);
}

static long lkl_sys_access(const char *file, int mode)
{
    return kasm_sys_faccessat(KASM_LKL_AT_FDCWD, file, mode);
}

static long lkl_sys_read(int fd, void *buf, size_t count)
{
    return kasm_sys_read(fd, (char *)buf, count);
}

static long lkl_sys_write(int fd, const void *buf, size_t count)
{
    return kasm_sys_write(fd, (const char *)buf, count);
}

static int require_success(const char *label, int rc)
{
    if (rc < 0) {
        printf("%s failed: %d\n", label, rc);
    }
    return rc;
}

static int setup_minimal_rootfs(void)
{
    static const struct {
        const char *path;
        unsigned int mode;
    } dirs[] = {
        {"/bin", 0755},
        {"/dev", 0755},
        {"/etc", 0755},
        {"/home", 0755},
        {"/proc", 0755},
        {"/sys", 0755},
        {"/tmp", 0777},
        {"/var", 0755},
        {"/var/run", 0755},
    };
    size_t i;

    for (i = 0; i < sizeof(dirs) / sizeof(dirs[0]); i++) {
        long rc = lkl_sys_mkdir(dirs[i].path, dirs[i].mode);
        if (rc < 0 && rc != -17) {
            printf("mkdir %s failed: %ld\n", dirs[i].path, rc);
            return (int)rc;
        }
    }

    if (require_success("mount proc",
                        (int)lkl_sys_mount("none", "/proc", "proc", 0, NULL)) < 0) {
        return -1;
    }
    if (require_success("mount sysfs",
                        (int)lkl_sys_mount("none", "/sys", "sysfs", 0, NULL)) < 0) {
        return -1;
    }
    if (require_success("mount devtmpfs",
                        (int)lkl_sys_mount("none", "/dev", "devtmpfs", 0, NULL)) < 0) {
        return -1;
    }

    return 0;
}

static int force_root_disk_registration(void)
{
    const char *device_spec;
    int rc;

    if (!kasm_root_disk_ready()) {
        return 0;
    }

    device_spec = strstr(lkl_virtio_devs, "virtio_mmio.device=");
    if (!device_spec) {
        printf("Root disk bootstrap failed: no queued virtio-mmio device\n");
        return -1;
    }

    device_spec = strchr(device_spec, '=');
    if (!device_spec || !device_spec[1]) {
        printf("Root disk bootstrap failed: malformed queued device '%s'\n",
               lkl_virtio_devs);
        return -1;
    }
    device_spec++;

    rc = require_success("force init virtio core", kasm_virtio_force_init());
    if (rc < 0) return rc;
    rc = require_success("force init bio", kasm_bio_force_init());
    if (rc < 0) return rc;
    rc = require_success("force init genhd", kasm_genhd_force_init());
    if (rc < 0) return rc;
    rc = require_success("force init virtio mmio", kasm_virtio_mmio_force_init());
    if (rc < 0) return rc;
    rc = require_success("force init virtio blk", kasm_virtio_blk_force_init());
    if (rc < 0) return rc;
    rc = require_success("force register root disk",
                         kasm_virtio_mmio_force_register(device_spec));
    if (rc < 0) return rc;

    printf("Registered root disk device %s\n", device_spec);
    return 0;
}

static int force_root_filesystem_support(void)
{
    int rc;

    rc = require_success("force init mbcache", kasm_mbcache_force_init());
    if (rc < 0) return rc;
    rc = require_success("force init crc32c", kasm_crc32c_force_init());
    if (rc < 0) return rc;
    rc = require_success("force init jbd2", kasm_jbd2_force_init());
    if (rc < 0) return rc;
    rc = require_success("force init ext4", kasm_ext4_force_init());
    if (rc < 0) return rc;

    return 0;
}

static int verify_rootfs_mount(void)
{
    char buf[64] = {0};
    long fd;
    long n;

    log_syscall_result("access /dev/vda", lkl_sys_access("/dev/vda", KASM_LKL_F_OK));
    log_syscall_result("mkdir /rootfs", lkl_sys_mkdir("/rootfs", 0755));
    log_syscall_result("mount /dev/vda",
                       lkl_sys_mount("/dev/vda", "/rootfs", "ext4", 0, NULL));
    log_syscall_result("access /rootfs/etc/hostname",
                       lkl_sys_access("/rootfs/etc/hostname", KASM_LKL_F_OK));

    fd = lkl_sys_open("/rootfs/etc/hostname", KASM_LKL_O_RDONLY, 0);
    if (fd < 0) {
        log_syscall_result("open /rootfs/etc/hostname for read", fd);
        return (int)fd;
    }

    log_syscall_result("open /rootfs/etc/hostname for read", fd);
    n = lkl_sys_read(fd, buf, sizeof(buf) - 1);
    log_syscall_result("read /rootfs/etc/hostname", n);
    log_syscall_result("close /rootfs/etc/hostname", lkl_sys_close(fd));
    printf("  read /rootfs/etc/hostname: '%s' (%ld bytes)\n", buf, n);

    return n < 0 ? (int)n : 0;
}

int kasm_bootstrap_rootfs(void)
{
    int rc;

    rc = setup_minimal_rootfs();
    if (rc < 0) {
        return rc;
    }

    rc = force_root_disk_registration();
    if (rc < 0) {
        return rc;
    }

    rc = force_root_filesystem_support();
    if (rc < 0) {
        return rc;
    }

    return verify_rootfs_mount();
}

void kasm_run_fs_smoke_test(void)
{
    long fd;

    printf("Post-boot filesystem smoke test...\n");
    log_syscall_result("access /", lkl_sys_access("/", KASM_LKL_F_OK));
    log_syscall_result("access /etc/hostname",
                       lkl_sys_access("/etc/hostname", KASM_LKL_F_OK));

    fd = lkl_sys_open("/etc/hostname", KASM_LKL_O_CREAT | KASM_LKL_O_WRONLY, 0644);
    if (fd >= 0) {
        log_syscall_result("open /etc/hostname for write", fd);
        log_syscall_result("write /etc/hostname", lkl_sys_write(fd, "kasm\n", 5));
        log_syscall_result("close /etc/hostname", lkl_sys_close(fd));
    } else {
        log_syscall_result("open /etc/hostname for write", fd);
    }

    fd = lkl_sys_open("/etc/hostname", KASM_LKL_O_RDONLY, 0);
    if (fd >= 0) {
        char buf[64] = {0};
        long n = lkl_sys_read(fd, buf, sizeof(buf) - 1);

        log_syscall_result("open /etc/hostname for read", fd);
        log_syscall_result("read /etc/hostname", n);
        log_syscall_result("close /etc/hostname", lkl_sys_close(fd));
        printf("  read /etc/hostname: '%s' (%ld bytes)\n", buf, n);
    } else {
        log_syscall_result("open /etc/hostname for read", fd);
    }
}
