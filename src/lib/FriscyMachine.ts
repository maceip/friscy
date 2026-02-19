// src/lib/FriscyMachine.ts
// @ts-ignore
import { saveOverlay, loadOverlay } from '../../friscy-bundle/overlay.js';

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

export interface MachineConfig {
  id: string;
  name: string;
  image: string;
  rootfs: string;
  entrypoint: string | string[];
  env?: string[];
  icon?: string;
}

export interface JitStats {
  compiledRegionCount: number;
  queueDepth: number;
  missRate: number;
  predictorHitRate: number;
  [key: string]: any;
}

export type MachineStatus = 'idle' | 'loading' | 'booting' | 'running' | 'paused' | 'exited' | 'error';

export class FriscyMachine {
  private worker: Worker | null = null;
  private controlSab: SharedArrayBuffer;
  private stdoutSab: SharedArrayBuffer;
  private netSab: SharedArrayBuffer;
  private controlView: Int32Array;
  private stdoutView: Int32Array;
  private stdoutBytes: Uint8Array;
  
  public status: MachineStatus = 'idle';
  public onStdout: (text: string) => void = () => {};
  public onStatusChange: (status: MachineStatus) => void = () => {};
    public onJitStats: (stats: JitStats) => void = () => {};
  public onExit: (code: number) => void = () => {};
  public onProgress: (pct: number, stage: string, detail?: string) => void = () => {};

  private pollInterval: any = null;
  private saveInterval: any = null;
  private stdinQueue: number[] = [];
  
  // Stats to track
  public instructionCount: number = 0;
  public ramUsageBytes: number = 0;
  public localDiskMounted: boolean = false;
  public syncActive: boolean = false;
  public snapshotData: ArrayBuffer | null = null;

  constructor(public config: MachineConfig) {
    this.controlSab = new SharedArrayBuffer(4096);
    this.stdoutSab = new SharedArrayBuffer(65536);
    this.netSab = new SharedArrayBuffer(65536);

    this.controlView = new Int32Array(this.controlSab);
    this.stdoutView = new Int32Array(this.stdoutSab);
    this.stdoutBytes = new Uint8Array(this.stdoutSab);
  }

  private setProgress(pct: number, stage: string, detail?: string) {
    this.onProgress(pct, stage, detail);
  }

  public async boot(existingRootfs?: ArrayBuffer) {
    this.setStatus('loading');
    this.setProgress(-1, 'Initializing worker...');
    
    this.worker = new Worker(new URL('../workers/emulator.worker.ts', import.meta.url), { type: 'module' });
    
    this.worker.onmessage = (e) => this.handleWorkerMessage(e);
    this.worker.onerror = (e) => {
        console.error('Worker error:', e);
        this.setStatus('error');
        this.setProgress(0, 'Error: Worker failed to start', (e as any).message);
    };

    const readyPromise = new Promise<void>((resolve) => {
      const handler = (e: MessageEvent) => {
        if (e.data.type === 'ready') {
          this.worker?.removeEventListener('message', handler);
          resolve();
        }
      };
      this.worker?.addEventListener('message', handler);
    });

    this.worker.postMessage({
      type: 'init',
      controlSab: this.controlSab,
      stdoutSab: this.stdoutSab,
      netSab: this.netSab,
      enableJit: true,
    });

    await readyPromise;

    try {
        const overlay = await loadOverlay(this.config.id);
        if (overlay) {
            console.log(`[machine] Loaded persistent overlay (${(overlay.byteLength/1024).toFixed(1)}KB)`);
        }
    } catch (e) {
        console.warn('[machine] Failed to load overlay:', e);
    }

    let rootfsData: ArrayBuffer;
    if (existingRootfs) {
        rootfsData = existingRootfs;
        this.setProgress(100, 'Using shared rootfs', 'Ready to boot');
    } else {
        this.setProgress(0, 'Downloading rootfs...', 'Starting download...');
        try {
            const response = await fetch(this.config.rootfs);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            rootfsData = await response.arrayBuffer();
        } catch (e: any) {
            this.setStatus('error');
            this.setProgress(0, 'Boot failed', e.message);
            return;
        }
    }

    this.setStatus('booting');
    this.setProgress(-1, 'Booting RISC-V kernel...');
    
    const entrypoint = Array.isArray(this.config.entrypoint) 
        ? this.config.entrypoint 
        : this.config.entrypoint.split(' ').filter(s => s);
            
    const envArgs = (this.config.env || []).flatMap(e => ['--env', e]);
    const args = [...envArgs, '--rootfs', '/rootfs.tar', ...entrypoint];

    this.worker.postMessage({
        type: 'run',
        args,
        rootfsData: rootfsData,
    }, [rootfsData]);

    this.setStatus('running');
    this.setProgress(100, 'Boot complete', 'Enjoy your session');
    this.startPolling();
    this.startAutoSave();
  }

  private startAutoSave() {
      this.syncActive = true;
      this.saveInterval = setInterval(async () => {
          if (this.status !== 'running' || !this.worker) return;
          Atomics.store(this.controlView, SabOffset.COMMAND, 8); // CMD_EXPORT_VFS
          Atomics.notify(this.controlView, SabOffset.COMMAND);
      }, 10000);
  }

  private handleWorkerMessage(e: MessageEvent) {
    const msg = e.data;
    if (msg.type === 'jit_stats') {
      // Update stats from worker
      this.instructionCount = msg.stats.instructions || 0;
      this.ramUsageBytes = msg.stats.ramUsage || 0;
      this.onJitStats(msg.stats);
    } else if (msg.type === 'error') {
      this.setStatus('error');
    } else if (msg.type === 'vfs_export') {
        saveOverlay(this.config.id, msg.tarData).then(() => {
            console.log('[machine] Auto-saved VFS state');
        });
    }
  }

  private setStatus(s: MachineStatus) {
    this.status = s;
    this.onStatusChange(s);
  }

  private startPolling() {
    this.pollInterval = setInterval(() => {
      this.drainStdout();
      this.checkStdinRequest();
      this.checkExit();
    }, 4);
  }

  private drainStdout() {
    const writeHead = Atomics.load(this.stdoutView, 0);
    const readTail = Atomics.load(this.stdoutView, 1);
    if (writeHead === readTail) return;

    const RING_SIZE = 65528;
    const RING_HEADER = 8;
    // Calculate available bytes correctly, handling wrap-around
    const available = writeHead >= readTail
        ? (writeHead - readTail) // Normal case: no wrap-around
        : (RING_SIZE - readTail) + writeHead; // Wrap-around case
    if (available <= 0) return;

    const buf = new Uint8Array(available);
    let pos = readTail;
    for (let i = 0; i < available; i++) {
        buf[i] = this.stdoutBytes[RING_HEADER + pos];
        pos = (pos + 1) % RING_SIZE;
    }
    Atomics.store(this.stdoutView, 1, pos);
    this.onStdout(new TextDecoder().decode(buf));
  }

  private checkStdinRequest() {
    const cmd = Atomics.load(this.controlView, SabOffset.COMMAND);
    if (cmd !== 2) return; 
    if (this.stdinQueue.length === 0) return;
    const maxLen = Atomics.load(this.controlView, SabOffset.LENGTH);
    const controlBytes = new Uint8Array(this.controlSab);
    const toSend = Math.min(this.stdinQueue.length, maxLen, 3968);
    for (let i = 0; i < toSend; i++) { controlBytes[SabOffset.PAYLOAD * 4 + i] = this.stdinQueue.shift()!; }
    Atomics.store(this.controlView, SabOffset.LENGTH, toSend);
    Atomics.store(this.controlView, SabOffset.COMMAND, 3); 
    Atomics.notify(this.controlView, SabOffset.COMMAND);
  }

  private checkExit() {
    const cmd = Atomics.load(this.controlView, SabOffset.COMMAND);
    if (cmd === 4) {
      this.setStatus('exited');
      this.onExit(Atomics.load(this.controlView, SabOffset.EXIT_CODE));
      clearInterval(this.pollInterval);
      if (this.saveInterval) clearInterval(this.saveInterval);
    }
  }

  public writeStdin(data: string) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(data);
    for (const b of bytes) { this.stdinQueue.push(b); }
    this.checkStdinRequest();
  }

  public resize(cols: number, rows: number) {
    Atomics.store(this.controlView, SabOffset.COLS, cols);
    Atomics.store(this.controlView, SabOffset.ROWS, rows);
    this.worker?.postMessage({ type: 'resize', cols, rows });
  }

  public writeFile(path: string, data: Uint8Array) {
    this.worker?.postMessage({ type: 'write_file', path, data: data.buffer }, [data.buffer]);
  }

  public mountLocal(handle: FileSystemDirectoryHandle) {
    this.worker?.postMessage({ type: 'mount_local', handle });
  }

  public snapshot(callback: (data: ArrayBuffer) => void) {
    if (!this.worker) return;
    const handler = (e: MessageEvent) => {
        if (e.data.type === 'vfs_export') {
            this.worker?.removeEventListener('message', handler);
            callback(e.data.tarData);
        }
    };
    this.worker.addEventListener('message', handler);
    Atomics.store(this.controlView, SabOffset.COMMAND, 8); // CMD_EXPORT_VFS
    Atomics.notify(this.controlView, SabOffset.COMMAND);
  }

  public terminate(newStatus: MachineStatus = 'idle') {
    if (this.pollInterval) clearInterval(this.pollInterval);
    if (this.saveInterval) clearInterval(this.saveInterval);
    this.worker?.terminate();
    this.worker = null;
    this.setStatus(newStatus);
  }
}
