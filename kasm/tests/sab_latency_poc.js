/**
 * SAB Latency POC - Proof of Concept
 * 
 * Tests the SAB syscall channel performance.
 * Research insight (ATC'19): 100K round-trips should complete under 2 seconds.
 */

import { createChannel, syscallRequest, testLatency, SYS } from '../middleware/sab_protocol.js';

// Simple mock kernel for testing
class MockKernel {
    constructor(channel) {
        this.channel = channel;
        this.running = false;
    }
    
    start() {
        this.running = true;
        this.processLoop();
    }
    
    stop() {
        this.running = false;
    }
    
    processLoop() {
        const checkRequests = () => {
            if (!this.running) return;
            
            const state = this.channel.getState();
            if (state === 1) { // REQUEST
                // Handle syscall (echo back success)
                const syscallNr = this.channel.getSyscall();
                const args = this.channel.getArgs();
                
                // Echo: return first arg as result
                this.channel.setRetval(args[0] || 0);
                this.channel.setErrno(0);
                this.channel.setState(2); // REPLY
                
                // Notify process
                Atomics.notify(this.channel.stateView, 0, 1);
            }
            
            setTimeout(checkRequests, 0);
        };
        
        checkRequests();
    }
}

async function runLatencyTest() {
    console.log('SAB Latency POC');
    console.log('================');
    console.log('');
    
    // Create channel
    const channel = createChannel(false); // Process-side
    const kernel = new MockKernel(channel);
    kernel.start();
    
    console.log('Running 100,000 syscall round-trips...');
    console.log('');
    
    const roundTrips = 100000;
    const startTime = performance.now();
    
    for (let i = 0; i < roundTrips; i++) {
        // Make a simple syscall
        syscallRequest(channel, SYS.getpid, [42, 0, 0, 0, 0, 0]);
    }
    
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    const avgLatency = totalTime / roundTrips;
    
    kernel.stop();
    
    console.log('Results:');
    console.log(`  Total time: ${totalTime.toFixed(2)}ms`);
    console.log(`  Round-trips: ${roundTrips.toLocaleString()}`);
    console.log(`  Average latency: ${avgLatency.toFixed(3)}ms (${(avgLatency * 1000).toFixed(1)}µs)`);
    console.log(`  Throughput: ${(roundTrips / (totalTime / 1000)).toFixed(0)} syscalls/sec`);
    console.log('');
    
    const passed = totalTime < 2000;
    
    if (passed) {
        console.log('✓ PASS: 100K round-trips under 2 seconds');
        console.log(`  (${(2000 - totalTime).toFixed(0)}ms margin)`);
    } else {
        console.log('✗ FAIL: Exceeded 2 second threshold');
        console.log(`  (${(totalTime - 2000).toFixed(0)}ms over)`);
    }
    
    console.log('');
    console.log('Research validation:');
    console.log('  ATC\'19 paper: "The cost of these memory copy operations');
    console.log('  is dwarfed by the overall cost of the system call invocation."');
    console.log('  SAB + Atomics provides the fastest syscall channel in browser.');
    
    return passed;
}

// Run test
if (typeof window !== 'undefined') {
    runLatencyTest().then(result => {
        const status = result ? 'PASS' : 'FAIL';
        if (document.body) {
            document.body.innerHTML = `<pre>SAB Latency POC: ${status}</pre>`;
        }
    });
} else if (typeof self !== 'undefined') {
    // Worker
} else {
    // Node.js
    runLatencyTest().then(result => {
        process.exit(result ? 0 : 1);
    });
}

export { runLatencyTest, MockKernel };
