import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FriscyMachine } from '../FriscyMachine';

let mockWorkerInstances: any[] = [];

// Mock Worker
class MockWorker {
  onmessage: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  addEventListener = vi.fn((type, handler) => {
      if (type === 'message') this.onmessage = handler;
  });
  removeEventListener = vi.fn();
  constructor() {
      mockWorkerInstances.push(this);
  }
}

// Mock SharedArrayBuffer
if (typeof global.SharedArrayBuffer === 'undefined') {
    (global as any).SharedArrayBuffer = class {
        byteLength: number;
        constructor(size: number) { this.byteLength = size; }
        slice() { return new Uint8Array(); }
    };
}

vi.stubGlobal('Worker', MockWorker);

describe('FriscyMachine', () => {
  beforeEach(() => {
    mockWorkerInstances = [];
    vi.clearAllMocks();
  });

  const config = {
    id: 'test-id',
    name: 'Test Machine',
    image: 'test:latest',
    rootfs: '/test.tar',
    entrypoint: '/bin/sh'
  };

  it('initializes with idle status', () => {
    const machine = new FriscyMachine(config);
    expect(machine.status).toBe('idle');
  });

  it('transitions through statuses during boot', async () => {
    const machine = new FriscyMachine(config);
    const statusChanges: string[] = [];
    machine.onStatusChange = (s) => statusChanges.push(s);

    // Mock fetch for rootfs
    const mockResponse = {
        ok: true,
        headers: new Map([['content-length', '100']]),
        body: {
            getReader: () => ({
                read: vi.fn()
                    .mockResolvedValueOnce({ done: false, value: new Uint8Array(50) })
                    .mockResolvedValueOnce({ done: true })
            })
        },
        arrayBuffer: async () => new ArrayBuffer(100)
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    // Start boot
    const bootPromise = machine.boot();

    // Trigger ready from worker
    await vi.waitFor(() => expect(mockWorkerInstances.length).toBe(1));
    const workerInstance = mockWorkerInstances[0];
    workerInstance.onmessage({ data: { type: 'ready' } });

    await bootPromise;

    expect(statusChanges).toContain('loading');
    expect(statusChanges).toContain('booting');
    expect(statusChanges).toContain('running');
    expect(machine.status).toBe('running');
  });

  it('handles worker errors', async () => {
    const machine = new FriscyMachine(config);
    machine.boot();
    
    await vi.waitFor(() => expect(mockWorkerInstances.length).toBe(1));
    const workerInstance = mockWorkerInstances[0];
    workerInstance.onerror({ message: 'Failed to start' });

    expect(machine.status).toBe('error');
  });

  it('terminates correctly', async () => {
    const machine = new FriscyMachine(config);
    machine.boot();
    await vi.waitFor(() => expect(mockWorkerInstances.length).toBe(1));
    const workerInstance = mockWorkerInstances[0];
    
    machine.terminate();
    expect(workerInstance.terminate).toHaveBeenCalled();
    expect(machine.status).toBe('idle');
  });
});
