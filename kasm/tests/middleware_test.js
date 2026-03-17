/**
 * Middleware Test Runner
 * 
 * Verifies K1-K6 middleware components with mock kernel.
 * Run with: node tests/middleware_test.js
 */

// Mock implementations for Node.js environment
// (Normally these run in browser with real Web Workers and SAB)

import { createChannel, syscallRequest, STATE, ERRNO } from '../middleware/sab_protocol.js';
import { FDTable } from '../middleware/fd_table.js';

// Test utilities
class TestRunner {
    constructor() {
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
    }

    test(name, fn) {
        this.tests.push({ name, fn });
    }

    async run() {
        console.log('Middleware Test Suite');
        console.log('====================\n');

        for (const { name, fn } of this.tests) {
            try {
                await fn();
                console.log(`✅ PASS: ${name}`);
                this.passed++;
            } catch (error) {
                console.log(`❌ FAIL: ${name}`);
                console.log(`   Error: ${error.message}`);
                this.failed++;
            }
        }

        console.log('\n====================');
        console.log(`Results: ${this.passed} passed, ${this.failed} failed`);
        console.log(`Total: ${this.tests.length} tests`);
        
        return this.failed === 0;
    }
}

// Create test runner instance
const runner = new TestRunner();

// ========== SAB Protocol Tests (K1) ==========

runner.test('K1: SAB channel creation', () => {
    const channel = createChannel(false);
    
    if (!channel.sab) throw new Error('SAB not created');
    if (channel.sab.byteLength !== 65536) throw new Error('SAB size not 64KB');
    if (channel.getState() !== 0) throw new Error('Initial state not IDLE');
});

runner.test('K1: SAB state transitions', () => {
    const channel = createChannel(false);
    
    channel.setState(STATE.REQUEST);
    if (channel.getState() !== 1) throw new Error('State not REQUEST');
    
    channel.setState(STATE.REPLY);
    if (channel.getState() !== 2) throw new Error('State not REPLY');
});

runner.test('K1: SAB data read/write', () => {
    const channel = createChannel(false);
    const testData = new Uint8Array([1, 2, 3, 4, 5]);
    
    channel.writeData(0, testData);
    const read = channel.readData(0, 5);
    
    if (read.length !== 5) throw new Error('Data length mismatch');
    if (read[0] !== 1 || read[4] !== 5) throw new Error('Data content mismatch');
});

// ========== Syscall Numbers Tests (K2) ==========

runner.test('K2: Syscall numbers defined', async () => {
    // Import syscall numbers
    const { SYS } = await import('../middleware/syscall_numbers.js');
    
    if (SYS.read !== 63) throw new Error('read syscall should be 63 (asm-generic)');
    if (SYS.write !== 64) throw new Error('write syscall should be 64 (asm-generic)');
    if (SYS.openat !== 56) throw new Error('openat syscall should be 56 (asm-generic)');
    if (SYS.exit !== 93) throw new Error('exit syscall should be 93');
});

runner.test('K2: Local vs Kernel syscall classification', async () => {
    const { isLocalSyscall, isKernelSyscall, SYS } = await import('../middleware/syscall_numbers.js');
    
    // Local syscalls
    if (!isLocalSyscall(SYS.brk)) throw new Error('brk should be local');
    if (!isLocalSyscall(SYS.getpid)) throw new Error('getpid should be local');
    if (!isLocalSyscall(SYS.clock_gettime)) throw new Error('clock_gettime should be local');
    
    // Kernel syscalls
    if (!isKernelSyscall(SYS.read)) throw new Error('read should be kernel');
    if (!isKernelSyscall(SYS.write)) throw new Error('write should be kernel');
    if (!isKernelSyscall(SYS.openat)) throw new Error('openat should be kernel');
});

// ========== FD Table Tests (K5) ==========

runner.test('K5: FD table initialization', () => {
    const fdTable = new FDTable();
    
    // Stdio fds should exist
    if (!fdTable.isValid(0)) throw new Error('stdin not in fd table');
    if (!fdTable.isValid(1)) throw new Error('stdout not in fd table');
    if (!fdTable.isValid(2)) throw new Error('stderr not in fd table');
});

runner.test('K5: FD allocation', () => {
    const fdTable = new FDTable();
    
    const fd = fdTable.allocate({ path: '/test', flags: 0 });
    if (fd < 3) throw new Error('Allocated fd should be >= 3');
    if (!fdTable.isValid(fd)) throw new Error('Allocated fd not valid');
});

runner.test('K5: FD close', () => {
    const fdTable = new FDTable();
    const fd = fdTable.allocate({ path: '/test' });
    
    const result = fdTable.close(fd);
    if (result !== 0) throw new Error('Close should return 0');
    if (fdTable.isValid(fd)) throw new Error('Closed fd should be invalid');
});

runner.test('K5: dup and dup3', () => {
    const fdTable = new FDTable();
    const fd1 = fdTable.allocate({ path: '/test' });
    
    const fd2 = fdTable.dup(fd1);
    if (fd2 <= fd1) throw new Error('dup should return higher fd');
    if (!fdTable.isValid(fd2)) throw new Error('duped fd should be valid');
    
    const fd3 = fdTable.dup(fd1, 100);
    if (fd3 !== 100) throw new Error('dup3 with specific fd should return that fd');
});

runner.test('K5: pipe2 creates two fds', () => {
    const fdTable = new FDTable();
    
    const [readFd, writeFd] = fdTable.pipe2(0, { kernelPipe: {} });
    
    if (!fdTable.isValid(readFd)) throw new Error('read fd not valid');
    if (!fdTable.isValid(writeFd)) throw new Error('write fd not valid');
    if (readFd === writeFd) throw new Error('pipe fds should be different');
});

runner.test('K5: dev and ino tracking', () => {
    const fdTable = new FDTable();
    const fd = fdTable.allocate({ path: '/test' });
    
    const entry = fdTable.get(fd);
    if (entry.dev === undefined) throw new Error('dev not set');
    if (entry.ino === undefined) throw new Error('ino not set');
    if (entry.dev < 1) throw new Error('dev should be >= 1');
    if (entry.ino < 3) throw new Error('ino should be >= 3 (after stdio)');
});

// ========== Error Code Tests ==========

runner.test('ERRNO: Standard error codes defined', () => {
    if (ERRNO.ENOENT !== 2) throw new Error('ENOENT should be 2');
    if (ERRNO.EACCES !== 13) throw new Error('EACCES should be 13');
    if (ERRNO.ENOSYS !== 38) throw new Error('ENOSYS should be 38');
});

// ========== Integration Tests ==========

runner.test('Integration: Full SAB round-trip (simulated)', async () => {
    const { createChannel, STATE } = await import('../middleware/sab_protocol.js');
    
    // Create single SAB (simulating shared memory between process and kernel)
    const sharedChannel = createChannel(false);
    
    // Simulate: Process writes request
    sharedChannel.setState(STATE.REQUEST);
    sharedChannel.setSyscall(63); // read
    sharedChannel.setArgs([0, 0, 1024, 0, 0, 0]); // fd=stdin, buf, count
    
    // Verify: State is REQUEST
    if (sharedChannel.getState() !== STATE.REQUEST) {
        throw new Error('State should be REQUEST');
    }
    
    // Simulate: Kernel reads request and replies
    if (sharedChannel.getSyscall() !== 63) {
        throw new Error('Kernel should see syscall 63 (read)');
    }
    
    const args = sharedChannel.getArgs();
    if (args[2] !== 1024) {
        throw new Error('Kernel should see count=1024');
    }
    
    // Kernel replies
    sharedChannel.setRetval(10); // read 10 bytes
    sharedChannel.setErrno(0);
    sharedChannel.setState(STATE.REPLY);
    
    // Process sees reply
    if (sharedChannel.getState() !== STATE.REPLY) {
        throw new Error('Process should see REPLY state');
    }
    if (sharedChannel.getRetval() !== 10) {
        throw new Error('Process should see retval=10');
    }
    if (sharedChannel.getErrno() !== 0) {
        throw new Error('Process should see errno=0');
    }
});

// Run all tests
runner.run().then(success => {
    process.exit(success ? 0 : 1);
});
