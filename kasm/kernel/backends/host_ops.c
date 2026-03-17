#include <lkl_host.h>
#include <pthread.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <semaphore.h>
#include <time.h>
#include <setjmp.h>
#include <emscripten.h>

// Shared with JS via a pre-allocated SAB
struct console_ring {
    volatile uint32_t write_head; // kernel writes here
    volatile uint32_t read_head;  // JS reads here
    uint32_t capacity;
    char data[];                  // ring buffer
};

// Global pointer to the ring buffer initialized by JS
struct console_ring *wasm_console_ring = NULL;

EMSCRIPTEN_KEEPALIVE
void kasm_set_console_ring(void *ptr) {
    wasm_console_ring = (struct console_ring *)ptr;
}

static void wasm_print(const char *str, int len) {
    if (wasm_console_ring) {
        uint32_t cap = wasm_console_ring->capacity;
        for (int i = 0; i < len; i++) {
            uint32_t head = wasm_console_ring->write_head;
            wasm_console_ring->data[head % cap] = str[i];
            // memory barrier logic implied by atomics if necessary
            // For now, just simple increment. JS uses Atomics.load.
            __atomic_store_n(&wasm_console_ring->write_head, head + 1, __ATOMIC_RELEASE);
        }
        // Notify JS that there is new data
        // For simplicity, we could Atomics.notify here if JS is waitAsync'ing
        // EM_ASM_({ Atomics.notify(new Int32Array(wasmMemory.buffer, $0), 0); }, &wasm_console_ring->write_head);
    } else {
        // Fallback before ring buffer is set up
        fwrite(str, 1, len, stdout);
        fflush(stdout);
    }
}

static void wasm_panic(void) {
    printf("WASM PANIC CALLED!\n");
    fflush(stdout);
    EM_ASM({ throw new Error("Kernel Panic"); });
}

struct lkl_mutex { pthread_mutex_t mutex; };
struct lkl_sem { sem_t sem; };
struct lkl_tls_key { pthread_key_t key; };

static struct lkl_sem *wasm_sem_alloc(int count) {
    struct lkl_sem *s = malloc(sizeof(*s));
    if (s) sem_init(&s->sem, 0, count);
    return s;
}

static void wasm_sem_free(struct lkl_sem *s) {
    if (s) { sem_destroy(&s->sem); free(s); }
}

static void wasm_sem_up(struct lkl_sem *s) { sem_post(&s->sem); }
static void wasm_sem_down(struct lkl_sem *s) { sem_wait(&s->sem); }

static struct lkl_mutex *wasm_mutex_alloc(int recursive) {
    struct lkl_mutex *m = malloc(sizeof(*m));
    if (m) {
        pthread_mutexattr_t attr;
        pthread_mutexattr_init(&attr);
        if (recursive) pthread_mutexattr_settype(&attr, PTHREAD_MUTEX_RECURSIVE);
        pthread_mutex_init(&m->mutex, &attr);
        pthread_mutexattr_destroy(&attr);
    }
    return m;
}

static void wasm_mutex_free(struct lkl_mutex *m) {
    if (m) { pthread_mutex_destroy(&m->mutex); free(m); }
}

static void wasm_mutex_lock(struct lkl_mutex *m) { pthread_mutex_lock(&m->mutex); }
static void wasm_mutex_unlock(struct lkl_mutex *m) { pthread_mutex_unlock(&m->mutex); }

static lkl_thread_t wasm_thread_create(void (*f)(void *), void *arg) {
    pthread_t thread;
    int ret = pthread_create(&thread, NULL, (void *(*)(void *))f, arg);
    if (ret != 0) {
        printf("ERROR: pthread_create failed with %d\n", ret);
        return 0;
    }
    printf("DEBUG: created thread %lu\n", (unsigned long)thread);
    return (lkl_thread_t)thread;
}

static void wasm_thread_detach(void) { pthread_detach(pthread_self()); }
static void wasm_thread_exit(void) { pthread_exit(NULL); }
static int wasm_thread_join(lkl_thread_t tid) { return pthread_join((pthread_t)tid, NULL); }
static lkl_thread_t wasm_thread_self(void) { return (lkl_thread_t)pthread_self(); }
static int wasm_thread_equal(lkl_thread_t a, lkl_thread_t b) { return pthread_equal((pthread_t)a, (pthread_t)b); }

static struct lkl_tls_key *wasm_tls_alloc(void (*destructor)(void *)) {
    struct lkl_tls_key *k = malloc(sizeof(*k));
    if (k) pthread_key_create(&k->key, destructor);
    return k;
}

static void wasm_tls_free(struct lkl_tls_key *k) {
    if (k) { pthread_key_delete(k->key); free(k); }
}

static int wasm_tls_set(struct lkl_tls_key *k, void *data) { return pthread_setspecific(k->key, data); }
static void *wasm_tls_get(struct lkl_tls_key *k) { return pthread_getspecific(k->key); }

static void *wasm_mem_alloc(unsigned long size) {
    void *ptr = malloc(size);
    if (!ptr) {
        printf("wasm_mem_alloc FAILED for size %lu\n", size);
        fflush(stdout);
    }
    return ptr;
}
static void wasm_mem_free(void *ptr) { free(ptr); }

static void *wasm_page_alloc(unsigned long size) {
    void *ptr = NULL;
    int ret = posix_memalign(&ptr, 4096, size);
    if (ret != 0) {
        printf("wasm_page_alloc FAILED for size %lu: error %d\n", size, ret);
        fflush(stdout);
        return NULL;
    }
    printf("wasm_page_alloc(%lu) -> %p\n", size, ptr);
    fflush(stdout);
    return ptr;
}
static void wasm_page_free(void *addr, unsigned long size) { free(addr); }

static unsigned long long wasm_time(void) {
    struct timespec ts;
    clock_gettime(CLOCK_REALTIME, &ts);
    return (unsigned long long)ts.tv_sec * 1000000000ULL + ts.tv_nsec;
}

struct wasm_timer {
    void (*fn)(void);
    int timer_id; // Store JS setTimeout ID if needed
};

static void *wasm_timer_alloc(void (*fn)(void)) {
    struct wasm_timer *t = malloc(sizeof(struct wasm_timer));
    if (t) {
        t->fn = fn;
        t->timer_id = -1;
    }
    return t;
}

EM_JS(int, start_js_timeout, (void *t_ptr, unsigned long ms), {
    return setTimeout(() => {
        _wasm_timer_fire(t_ptr);
    }, ms);
});

EM_JS(void, clear_js_timeout, (int id), {
    clearTimeout(id);
});

// We must export this so JS can call it
EMSCRIPTEN_KEEPALIVE
void wasm_timer_fire(void *t_ptr) {
    struct wasm_timer *t = (struct wasm_timer *)t_ptr;
    if (t && t->fn) t->fn();
}

static int wasm_timer_set_oneshot(void *_timer, unsigned long delta) {
    struct wasm_timer *t = (struct wasm_timer *)_timer;
    unsigned long ms = delta / 1000000;
    if (ms == 0) ms = 1; // min timeout
    if (t->timer_id != -1) {
        clear_js_timeout(t->timer_id);
    }
    t->timer_id = start_js_timeout(t, ms);
    return 0;
}

static void wasm_timer_free(void *_timer) {
    struct wasm_timer *t = (struct wasm_timer *)_timer;
    if (t->timer_id != -1) {
        clear_js_timeout(t->timer_id);
    }
    free(t);
}

static void *wasm_ioremap(long addr, int size) { return (void *)addr; }
static int wasm_iomem_access(const volatile void *addr, void *val, int size, int write) {
    if (write) memcpy((void *)addr, val, size);
    else memcpy(val, (void *)addr, size);
    return 0;
}

static void wasm_jmp_buf_set(struct lkl_jmp_buf *jmpb, void (*f)(void)) {
    if (!setjmp(*(jmp_buf *)jmpb->buf)) f();
}

static void wasm_jmp_buf_longjmp(struct lkl_jmp_buf *jmpb, int val) {
    longjmp(*(jmp_buf *)jmpb->buf, val);
}

struct lkl_host_operations lkl_host_ops = {
    .print = wasm_print,
    .panic = wasm_panic,
    .sem_alloc = wasm_sem_alloc,
    .sem_free = wasm_sem_free,
    .sem_up = wasm_sem_up,
    .sem_down = wasm_sem_down,
    .mutex_alloc = wasm_mutex_alloc,
    .mutex_free = wasm_mutex_free,
    .mutex_lock = wasm_mutex_lock,
    .mutex_unlock = wasm_mutex_unlock,
    .thread_create = wasm_thread_create,
    .thread_detach = wasm_thread_detach,
    .thread_exit = wasm_thread_exit,
    .thread_join = wasm_thread_join,
    .thread_self = wasm_thread_self,
    .thread_equal = wasm_thread_equal,
    .tls_alloc = wasm_tls_alloc,
    .tls_free = wasm_tls_free,
    .tls_set = wasm_tls_set,
    .tls_get = wasm_tls_get,
    .mem_alloc = wasm_mem_alloc,
    .mem_free = wasm_mem_free,
    .page_alloc = wasm_page_alloc,
    .page_free = wasm_page_free,
    .time = wasm_time,
    .timer_alloc = wasm_timer_alloc,
    .timer_set_oneshot = wasm_timer_set_oneshot,
    .timer_free = wasm_timer_free,
    .ioremap = wasm_ioremap,
    .iomem_access = wasm_iomem_access,
    .jmp_buf_set = wasm_jmp_buf_set,
    .jmp_buf_longjmp = wasm_jmp_buf_longjmp,
    .memcpy = memcpy,
    .memset = memset,
    .memmove = memmove,
};
