#include <lkl_host.h>
#include <stdio.h>
#include <stdbool.h>
#include <emscripten.h>
#include <pthread.h>

extern struct lkl_host_operations lkl_host_ops;

int lkl_init(struct lkl_host_operations *lkl_ops);
int lkl_start_kernel(const char *cmd_line, ...);
long lkl_sys_mkdir(const char *path, unsigned int mode);
long lkl_sys_open(const char *file, int flags, int mode);
long lkl_sys_write(int fd, const void *buf, size_t count);
long lkl_sys_read(int fd, void *buf, size_t count);
long lkl_sys_close(int fd);
long lkl_sys_mount(const char *dev_name, const char *dir_name, const char *type, unsigned long flags, void *data);
long lkl_sys_access(const char *file, int mode);
long kasm_sys_mkdirat(int dfd, const char *pathname, unsigned short mode);
long kasm_sys_openat(int dfd, const char *filename, int flags, unsigned short mode);
long kasm_sys_mount(char *dev_name, char *dir_name, char *type, unsigned long flags, void *data);

#define LKL_O_RDONLY 00
#define LKL_O_WRONLY 01
#define LKL_O_CREAT  0100
#define LKL_F_OK 0

int __start___ex_table, __stop___ex_table;
int __sched_class_lowest, __sched_class_highest;
int __irqentry_text_start, __irqentry_text_end;
int __softirqentry_text_start, __softirqentry_text_end;
int _einittext, _sinittext;
int _etext, _stext;
int _sdata, _edata;
int __bss_start, __bss_stop;
int _end;
int __start_rodata, __end_rodata;
int __start___trace_bprintk_fmt, __stop___trace_bprintk_fmt;
int __start_ftrace_eval_maps, __stop_ftrace_eval_maps;
int __start_ftrace_events, __stop_ftrace_events;
int __init_begin, __init_end;
int __dtb_start, __dtb_end;
int __kunit_suites_start, __kunit_suites_end;
int __start___modver, __stop___modver;
int __start___tracepoint_str, __stop___tracepoint_str;
int __start_pci_fixups_early, __end_pci_fixups_early;
int __start_pci_fixups_header, __end_pci_fixups_header;
int __start_pci_fixups_final, __end_pci_fixups_final;
int __start_pci_fixups_enable, __end_pci_fixups_enable;
int __start_pci_fixups_resume, __end_pci_fixups_resume;
int __start_pci_fixups_resume_early, __end_pci_fixups_resume_early;
int __start_pci_fixups_suspend, __end_pci_fixups_suspend;
int __start_pci_fixups_suspend_late, __end_pci_fixups_suspend_late;

extern void **__con_initcall_start;

struct task_struct;
struct thread_info {
    struct task_struct *task;
    unsigned long flags;
    int preempt_count;
    struct lkl_sem *sched_sem;
    struct lkl_jmp_buf sched_jb;
    bool dead;
    lkl_thread_t tid;
    struct task_struct *prev_sched;
    unsigned long stackend;
};

extern struct task_struct init_task;

enum {
    KASM_LKL_THREAD_SIZE = 4096,
    KASM_INIT_PREEMPT_COUNT = 1,
};

struct kasm_init_thread_area {
    struct thread_info thread_info;
    unsigned char padding[KASM_LKL_THREAD_SIZE - sizeof(struct thread_info)];
};

struct kasm_init_thread_area kasm_init_thread_area
    __attribute__((aligned(KASM_LKL_THREAD_SIZE))) = {
    .thread_info = {
        .task = &init_task,
        .flags = 0,
        .preempt_count = KASM_INIT_PREEMPT_COUNT,
    }
};

__asm__(".globl init_thread_union\ninit_thread_union = kasm_init_thread_area");
__asm__(".globl init_stack\ninit_stack = kasm_init_thread_area");

unsigned long __per_cpu_offset[1] = {0};

typedef int (*initcall_t)(void);
extern initcall_t __initcall_table[];
extern int __initcall_table_size;
extern int do_one_initcall(initcall_t fn);

void do_pre_smp_initcalls(void) {
}

void do_initcalls(void) {
    printf("Executing %d initcalls...\n", __initcall_table_size);
    for (int i = 0; i < __initcall_table_size; i++) {
        if (__initcall_table[i]) {
            do_one_initcall(__initcall_table[i]);
        }
    }
}

extern initcall_t __con_initcall_table[];
extern int __con_initcall_table_size;

void console_init(void) {
    printf("Executing %d console initcalls...\n", __con_initcall_table_size);
    for (int i = 0; i < __con_initcall_table_size; i++) {
        if (__con_initcall_table[i]) {
            __con_initcall_table[i]();
        }
    }
}

static void log_syscall_result(const char *label, long ret) {
    printf("  %s: %ld\n", label, ret);
}

#define LKL_AT_FDCWD -100

long lkl_syscall(long no, long *params);

long lkl_sys_mkdir(const char *path, unsigned int mode) {
    return kasm_sys_mkdirat(LKL_AT_FDCWD, path, (unsigned short)mode);
}

long lkl_sys_mount(const char *dev_name, const char *dir_name, const char *type, unsigned long flags, void *data) {
    return kasm_sys_mount((char *)dev_name, (char *)dir_name, (char *)type, flags, data);
}

long lkl_sys_open(const char *file, int flags, int mode) {
    return kasm_sys_openat(LKL_AT_FDCWD, file, flags, (unsigned short)mode);
}

long lkl_sys_close(int fd) {
    long params[6] = { fd, 0, 0, 0, 0, 0 };
    return lkl_syscall(57, params);
}

long lkl_sys_access(const char *file, int mode) {
    long params[6] = { LKL_AT_FDCWD, (long)file, mode, 0, 0, 0 };
    return lkl_syscall(48, params);
}

long lkl_sys_read(int fd, void *buf, size_t count) {
    long params[6] = { fd, (long)buf, count, 0, 0, 0 };
    return lkl_syscall(63, params);
}

long lkl_sys_write(int fd, const void *buf, size_t count) {
    long params[6] = { fd, (long)buf, count, 0, 0, 0 };
    return lkl_syscall(64, params);
}

int main() {
    printf("Initializing LKL from WebAssembly...\n");
    
    pthread_key_t key;
    pthread_key_create(&key, NULL);
    pthread_setspecific(key, (void*)0xdeadbeef);
    printf("TLS test: %p\n", pthread_getspecific(key));

    int ret = lkl_init(&lkl_host_ops);
    if (ret < 0) {
        printf("LKL initialization failed: %d\n", ret);
        return 1;
    }

    printf("__per_cpu_offset[0] = %lx\n", __per_cpu_offset[0]);

    ret = lkl_start_kernel("mem=64M loglevel=8 earlyprintk=yes initcall_debug=1");
    if (ret < 0) {
        printf("LKL kernel start failed: %d\n", ret);
        return 1;
    }

    printf("LKL kernel booted successfully!\n");

    printf("Post-boot filesystem smoke test...\n");
    log_syscall_result("access /", lkl_sys_access("/", LKL_F_OK));
    log_syscall_result("mkdir /proc", lkl_sys_mkdir("/proc", 0755));
    log_syscall_result("mkdir /tmp", lkl_sys_mkdir("/tmp", 0777));
    log_syscall_result("mkdir /bin", lkl_sys_mkdir("/bin", 0755));
    log_syscall_result("mkdir /etc", lkl_sys_mkdir("/etc", 0755));
    log_syscall_result("mkdir /dev", lkl_sys_mkdir("/dev", 0755));
    log_syscall_result("mount proc", lkl_sys_mount("none", "/proc", "proc", 0, NULL));

    long fd = lkl_sys_open("/etc/hostname", LKL_O_CREAT | LKL_O_WRONLY, 0644);
    if (fd >= 0) {
        log_syscall_result("open /etc/hostname for write", fd);
        log_syscall_result("write /etc/hostname", lkl_sys_write(fd, "kasm\n", 5));
        log_syscall_result("close /etc/hostname", lkl_sys_close(fd));
    } else {
        log_syscall_result("open /etc/hostname for write", fd);
    }

    fd = lkl_sys_open("/etc/hostname", LKL_O_RDONLY, 0);
    if (fd >= 0) {
        char buf[64] = {0};
        log_syscall_result("open /etc/hostname for read", fd);
        long n = lkl_sys_read(fd, buf, sizeof(buf) - 1);
        log_syscall_result("read /etc/hostname", n);
        log_syscall_result("close /etc/hostname", lkl_sys_close(fd));
        printf("  read /etc/hostname: '%s' (%ld bytes)\n", buf, n);
    } else {
        log_syscall_result("open /etc/hostname for read", fd);
    }

    printf("Kernel ready. Entering idle.\n");

    // Keep alive — in production, the middleware event loop takes over here
    emscripten_exit_with_live_runtime();

    return 0;
}
