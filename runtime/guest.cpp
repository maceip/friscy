// guest.cpp - Example RISC-V guest program demonstrating friscy capabilities
//
// This is a test guest that exercises various syscalls and features
// that a real container workload would use.
//
// Cross-compile with:
//   riscv64-linux-gnu-gcc -static -O2 -o guest guest.cpp
//
// Or using musl (smaller binary):
//   riscv64-linux-musl-gcc -static -O2 -o guest guest.cpp

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <dirent.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>

// ANSI colors for pretty output
#define GREEN "\033[32m"
#define RED   "\033[31m"
#define RESET "\033[0m"

static int tests_passed = 0;
static int tests_failed = 0;

#define TEST(name, condition) do { \
    if (condition) { \
        printf(GREEN "[PASS]" RESET " %s\n", name); \
        tests_passed++; \
    } else { \
        printf(RED "[FAIL]" RESET " %s\n", name); \
        tests_failed++; \
    } \
} while(0)

// Test basic I/O
void test_stdio() {
    printf("\n=== Testing stdio ===\n");

    // printf
    int n = printf("Hello from RISC-V guest!\n");
    TEST("printf returns byte count", n > 0);

    // fprintf to stderr
    n = fprintf(stderr, "This goes to stderr\n");
    TEST("fprintf to stderr", n > 0);
}

// Test filesystem operations
void test_filesystem() {
    printf("\n=== Testing filesystem ===\n");

    // getcwd
    char cwd[256];
    char* result = getcwd(cwd, sizeof(cwd));
    TEST("getcwd succeeds", result != nullptr);
    printf("  Current directory: %s\n", cwd);

    // stat on /
    struct stat st;
    int ret = stat("/", &st);
    TEST("stat / succeeds", ret == 0);
    TEST("/ is a directory", S_ISDIR(st.st_mode));

    // Check for common paths (if running in container mode)
    ret = stat("/bin", &st);
    if (ret == 0) {
        TEST("/bin exists", true);

        // Try to open /bin directory
        DIR* dir = opendir("/bin");
        if (dir) {
            int count = 0;
            struct dirent* entry;
            while ((entry = readdir(dir)) != nullptr) {
                count++;
                if (count <= 5) {
                    printf("  /bin/%s\n", entry->d_name);
                }
            }
            if (count > 5) {
                printf("  ... and %d more files\n", count - 5);
            }
            closedir(dir);
            TEST("readdir /bin", count > 0);
        }
    } else {
        printf("  (running in standalone mode, /bin not available)\n");
    }

    // Check /etc files
    ret = stat("/etc/passwd", &st);
    TEST("/etc/passwd exists", ret == 0);

    // Read /etc/passwd
    if (ret == 0) {
        FILE* f = fopen("/etc/passwd", "r");
        if (f) {
            char line[256];
            if (fgets(line, sizeof(line), f)) {
                printf("  /etc/passwd: %s", line);
            }
            fclose(f);
        }
    }
}

// Test memory operations
void test_memory() {
    printf("\n=== Testing memory ===\n");

    // malloc/free
    void* ptr = malloc(1024);
    TEST("malloc 1KB", ptr != nullptr);
    if (ptr) {
        memset(ptr, 0xAB, 1024);
        TEST("memset succeeds", ((char*)ptr)[512] == (char)0xAB);
        free(ptr);
    }

    // Larger allocation
    ptr = malloc(1024 * 1024);  // 1MB
    TEST("malloc 1MB", ptr != nullptr);
    if (ptr) free(ptr);

    // calloc
    ptr = calloc(256, sizeof(int));
    TEST("calloc", ptr != nullptr);
    if (ptr) {
        TEST("calloc zeros memory", ((int*)ptr)[100] == 0);
        free(ptr);
    }

    // realloc
    ptr = malloc(100);
    if (ptr) {
        ptr = realloc(ptr, 1000);
        TEST("realloc", ptr != nullptr);
        if (ptr) free(ptr);
    }
}

// Test time functions
void test_time() {
    printf("\n=== Testing time ===\n");

    time_t now = time(nullptr);
    TEST("time() returns non-zero", now > 0);
    printf("  Current time: %ld\n", (long)now);

    struct timespec ts;
    int ret = clock_gettime(CLOCK_REALTIME, &ts);
    TEST("clock_gettime succeeds", ret == 0);
    printf("  Timespec: %ld.%09ld\n", (long)ts.tv_sec, ts.tv_nsec);
}

// Test process info
void test_process() {
    printf("\n=== Testing process info ===\n");

    pid_t pid = getpid();
    TEST("getpid returns > 0", pid > 0);
    printf("  PID: %d\n", pid);

    uid_t uid = getuid();
    printf("  UID: %d\n", uid);

    gid_t gid = getgid();
    printf("  GID: %d\n", gid);
}

// Test environment
void test_environment() {
    printf("\n=== Testing environment ===\n");

    const char* path = getenv("PATH");
    TEST("PATH is set", path != nullptr);
    if (path) printf("  PATH: %s\n", path);

    const char* home = getenv("HOME");
    TEST("HOME is set", home != nullptr);
    if (home) printf("  HOME: %s\n", home);

    const char* term = getenv("TERM");
    if (term) printf("  TERM: %s\n", term);
}

// Test command line arguments
void test_argv(int argc, char** argv) {
    printf("\n=== Testing argv ===\n");

    TEST("argc >= 1", argc >= 1);
    printf("  argc: %d\n", argc);

    for (int i = 0; i < argc && i < 5; i++) {
        printf("  argv[%d]: %s\n", i, argv[i]);
    }
    if (argc > 5) {
        printf("  ... and %d more arguments\n", argc - 5);
    }
}

// Compute-intensive test
void test_compute() {
    printf("\n=== Testing compute ===\n");

    // Prime counting (simple sieve)
    const int N = 10000;
    int count = 0;

    for (int n = 2; n <= N; n++) {
        bool is_prime = true;
        for (int d = 2; d * d <= n; d++) {
            if (n % d == 0) {
                is_prime = false;
                break;
            }
        }
        if (is_prime) count++;
    }

    // There are 1229 primes <= 10000
    TEST("prime count correct", count == 1229);
    printf("  Primes <= %d: %d\n", N, count);

    // FP test
    double sum = 0.0;
    for (int i = 1; i <= 1000; i++) {
        sum += 1.0 / (double)i;
    }
    // Harmonic series H_1000 ≈ 7.485
    TEST("FP harmonic sum", sum > 7.4 && sum < 7.6);
    printf("  H_1000 = %.6f\n", sum);
}

int main(int argc, char** argv) {
    printf("╔════════════════════════════════════════╗\n");
    printf("║   friscy Guest Test Suite (RISC-V)     ║\n");
    printf("╚════════════════════════════════════════╝\n");

    test_argv(argc, argv);
    test_stdio();
    test_environment();
    test_process();
    test_time();
    test_memory();
    test_filesystem();
    test_compute();

    printf("\n════════════════════════════════════════\n");
    printf("Results: " GREEN "%d passed" RESET ", " RED "%d failed" RESET "\n",
           tests_passed, tests_failed);
    printf("════════════════════════════════════════\n");

    return tests_failed > 0 ? 1 : 0;
}
