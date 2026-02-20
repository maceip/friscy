const fs = require('fs');

async function transplantAndRun() {
    // 1. Read the 28MB Risk V2 state from disk
    const stateBuffer = fs.readFileSync('risk_v2_28mb.bin');

    // 2. Create the Wasm Memory object
    // 'initial' is in 64KB pages. 512 pages = 32MB.
    const memory = new WebAssembly.Memory({ 
        initial: 512, 
        maximum: 512,
        shared: true // Use this if you plan to use Workers later
    });

    // 3. The Surgery: Write the binary blob into the Wasm Linear Memory
    const view = new Uint8Array(memory.buffer);
    view.set(stateBuffer);

    // 4. Load your AssemblyScript-compiled RISC-V engine
    const wasmBuffer = fs.readFileSync('emulator_core.wasm');

    // 5. Instantiate with the pre-filled memory
    const { instance } = await WebAssembly.instantiate(wasmBuffer, {
        env: {
            memory: memory, // This binds the Wasm's internal memory to your 28MB blob
            abort: (msg, file, line, col) => {
                console.error(`Abort called: ${msg} at ${file}:${line}:${col}`);
            }
        }
    });

    // 6. Start the 2 trillion instruction marathon
    console.log("Memory transplanted. Starting Risk V2 execution...");
    instance.exports.start_emulation(); 
}

transplantAndRun().catch(console.error);
