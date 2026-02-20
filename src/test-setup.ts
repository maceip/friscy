import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
}));

// Mock navigator.storage
if (typeof navigator !== 'undefined') {
    const mockHandle = {
        getDirectoryHandle: vi.fn().mockReturnThis(),
        getFileHandle: vi.fn().mockResolvedValue({
            getFile: vi.fn().mockResolvedValue({
                arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0))
            })
        }),
        removeEntry: vi.fn().mockResolvedValue(undefined),
    };

    (navigator as any).storage = {
        getDirectory: vi.fn().mockResolvedValue(mockHandle)
    };
}
