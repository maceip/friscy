const kernelModule = require('./kernel.js');
const fs = require('fs');
const path = require('path');

console.log("Starting Kernel...");

const rootfsImage = path.join(__dirname, 'rootfs', 'rootfs.ext4');

kernelModule({
    preRun: [Module => {
        if (!fs.existsSync(rootfsImage)) {
            console.log(`Rootfs image not found at ${rootfsImage}; booting without preloaded disk`);
            return;
        }

        const image = fs.readFileSync(rootfsImage);
        const ptr = Module._malloc(image.length);
        const heap = new Uint8Array(Module.wasmMemory.buffer, ptr, image.length);
        heap.set(image);
        Module._kasm_set_root_disk(ptr, BigInt(image.length));
        console.log(`Preloaded rootfs.ext4 (${image.length} bytes)`);
    }],
}).then(Module => {
    console.log("Kernel Module Instantiated");
    
    const cap = 4096;
    if (Module.wasmMemory) {
        const ring_ptr = Module._malloc(12 + cap); // 3 uint32 + cap
        const ring_view = new Uint32Array(Module.wasmMemory.buffer, ring_ptr, 3);
        ring_view[0] = 0; // write_head
        ring_view[1] = 0; // read_head
        ring_view[2] = cap; // capacity
        
        Module._kasm_set_console_ring(ring_ptr);
        
        const data_view = new Uint8Array(Module.wasmMemory.buffer, ring_ptr + 12, cap);
        
        // Simple polling for new console output
        setInterval(() => {
            const write_head = Atomics.load(ring_view, 0);
            let read_head = ring_view[1];
            
            if (write_head > read_head) {
                let out = "";
                while (read_head < write_head) {
                    out += String.fromCharCode(data_view[read_head % cap]);
                    read_head++;
                }
                ring_view[1] = read_head;
                process.stdout.write(out);
            }
        }, 10);
    } else {
        console.error("No wasmMemory found!");
    }
}).catch(err => {
    console.error("Kernel Instantiation Error:", err);
});
