#include <lkl_host.h>
#include "bootstrap.h"
#include <stdio.h>
#include <stdbool.h>
#include <emscripten.h>
#include <pthread.h>

extern struct lkl_host_operations lkl_host_ops;

int lkl_init(struct lkl_host_operations *lkl_ops);
int lkl_start_kernel(const char *cmd_line, ...);
int kasm_root_disk_ready(void);
int kasm_add_root_disk(void);

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

void do_pre_smp_initcalls(void) {
}

void console_init(void) {
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

    if (kasm_root_disk_ready()) {
        ret = kasm_add_root_disk();
        if (ret < 0) {
            printf("Failed to register root disk: %d\n", ret);
            return 1;
        }
        printf("Registered root disk before boot: id=%d\n", ret);
    }

    ret = lkl_start_kernel("mem=64M loglevel=8 earlyprintk=yes initcall_debug=1");
    if (ret < 0) {
        printf("LKL kernel start failed: %d\n", ret);
        return 1;
    }

    printf("LKL kernel booted successfully!\n");
    ret = kasm_bootstrap_rootfs();
    if (ret < 0) {
        printf("Rootfs bootstrap failed: %d\n", ret);
        return 1;
    }
    kasm_run_fs_smoke_test();

    printf("Kernel ready. Entering idle.\n");

    // Keep alive — in production, the middleware event loop takes over here
    emscripten_exit_with_live_runtime();

    return 0;
}
