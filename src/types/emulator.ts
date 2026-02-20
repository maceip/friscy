// src/types/emulator.ts

export enum SabOffset {
    COMMAND = 0,
    STATUS = 1,
    LENGTH = 2,
    FD = 3,
    RESULT = 4,
    EXIT_CODE = 5,
    COLS = 6,
    ROWS = 7,
    PAYLOAD = 16 
}

export type MachineStatus = 'idle' | 'loading' | 'booting' | 'running' | 'paused' | 'exited' | 'error';

export interface BootState {
    pct: number;
    stage: string;
    detail?: string;
}

export interface MachineStats {
    opfs: string;
    ram: string;
    net: string;
    instructions: string;
    localDisk: boolean;
    containerSync: boolean;
    context: number;
    fuel: number;
    workstream: string;
    activeProvider: 'Claude' | 'Gemini' | 'OpenAI';
}

export interface JitStats {
    regionsCompiled: number;
    baselineCompiles: number;
    optimizedCompiles: number;
    promotedRegions: number;
    jitHits: number;
    jitMisses: number;
    compilationTimeMs: number;
    dispatchCalls: number;
    regionMisses: number;
    traceEdgesObserved: number;
    traceCompilesTriggered: number;
    traceTripletsObserved: number;
    traceTripletCompilesTriggered: number;
    markovPredictionsEvaluated: number;
    markovPredictionsAccepted: number;
    predictorHits: number;
    predictorMisses: number;
    compileQueueEnqueued: number;
    compileQueueDropped: number;
    compileQueuePeak: number;
    compileFailures: number;
    cooldownDeferrals: number;
    stalePrunes: number;
    missesBeforeSteady: number;
    compiledRegionCount: number;
    hotPages: number;
    dirtyPages: number;
    queueDepth: number;
    queuePressure: number;
    activeCompileCount: number;
    compileBudgetPerSecond: number;
    compileTokens: number;
    missRate: number;
    predictorHitRate: number;
    predictorAttempts: number;
}

export interface EmscriptenFS {
    writeFile(path: string, data: Uint8Array | string): void;
    readFile(path: string, opts?: { encoding?: 'binary' | 'utf8'; flags?: string }): Uint8Array | string;
    unlink(path: string): void;
    mkdir(path: string): void;
    analyzePath(path: string): { exists: boolean; object: any };
}

export interface EmscriptenModule {
    FS: EmscriptenFS;
    callMain(args: string[]): Promise<number>;
    _friscy_stopped(): boolean;
    _friscy_resume(): Promise<boolean>;
    _friscy_get_pc(): number;
    _friscy_set_pc(pc: number): void;
    _friscy_get_state_ptr(): number;
    _friscy_host_fetch_pending(): boolean;
    _friscy_get_fetch_request(): number;
    _friscy_get_fetch_request_len(): number;
    _friscy_set_fetch_response(ptr: number, len: number): void;
    _friscy_export_tar(sizePtr: number): number;
    _malloc(size: number): number;
    _free(ptr: number): void;
    HEAPU8: Uint8Array;
    HEAPU32: Uint32Array;
    wasmMemory: WebAssembly.Memory;
    asm?: { memory: WebAssembly.Memory };
    
    // Callbacks
    onSocketCreated?: (fd: number, domain: number, type: number) => void;
    onSocketConnect?: (fd: number, addrData: Uint8Array) => number;
    onSocketBind?: (fd: number, addrData: Uint8Array) => number;
    onSocketListen?: (fd: number, backlog: number) => number;
    onSocketAccept?: (fd: number) => { fd: number; addr: Uint8Array } | number;
    onSocketSend?: (fd: number, data: Uint8Array) => number;
    onSocketClosed?: (fd: number) => number;
    onSocketShutdown?: (fd: number, how: number) => void;
    hasSocketData?: (fd: number) => boolean;
    readSocketData?: (fd: number, maxLen: number) => number[] | null;
    hasPendingAccept?: (fd: number) => boolean;
    
    // Internal state
    _stdinBuffer: number[];
    _termRows: number;
    _termCols: number;
}

export type WorkerMessage =
    | { type: 'init'; controlSab: SharedArrayBuffer; stdoutSab: SharedArrayBuffer; netSab?: SharedArrayBuffer; enableJit: boolean; [key: string]: any }
    | { type: 'run'; args: string[]; rootfsData: ArrayBuffer }
    | { type: 'resize'; rows: number; cols: number }
    | { type: 'write_file'; path: string; data: ArrayBuffer }
    | { type: 'load_overlay'; data: ArrayBuffer }
    | { type: 'mount_local'; handle: FileSystemDirectoryHandle };

export type MainThreadMessage = 
    | { type: 'ready' }
    | { type: 'error'; message: string; stack?: string }
    | { type: 'jit_stats'; stats: JitStats; ts: number }
    | { type: 'vfs_export'; tarData: ArrayBuffer };
