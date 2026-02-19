import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import App from '../App';
import React from 'react';
import '@testing-library/jest-dom';

// Mock dnd-kit
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: any) => <div>{children}</div>,
  useSensor: () => {},
  useSensors: () => [],
  PointerSensor: {},
  KeyboardSensor: {},
  closestCenter: {},
}));

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: null,
    isDragging: false,
  }),
  SortableContext: ({ children }: any) => <div>{children}</div>,
  rectSortingStrategy: {},
  sortableKeyboardCoordinates: {},
}));

// Mock TerminalView
vi.mock('../components/TerminalView', () => ({
  TerminalView: () => <div data-testid="terminal-view" />
}));

// Mock FriscyMachine as a class
vi.mock('../lib/FriscyMachine', () => {
  return {
    FriscyMachine: vi.fn().mockImplementation(function(this: any, config: any) {
      this.config = config;
      this.status = 'idle';
      this.boot = vi.fn().mockResolvedValue(undefined);
      this.terminate = vi.fn();
      this.onProgress = vi.fn();
      this.onStatusChange = vi.fn();
    })
  };
});

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock fetch for shared rootfs
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(10)
    }));
  });

  it('renders loading state initially or transitions quickly', async () => {
    await act(async () => {
        render(<App />);
    });
    // It might be gone immediately because our mock rootfs resolves instantly
    const loading = screen.queryByText('Initializing shared filesystem...');
    const frames = screen.queryAllByText('Claude Code');
    expect(loading || frames.length > 0).toBeTruthy();
  });

  it('boots with 3 default frames after loading rootfs', async () => {
    await act(async () => {
        render(<App />);
    });
    
    await waitFor(() => {
        expect(screen.getAllByText('Claude Code').length).toBeGreaterThan(0);
    }, { timeout: 5000 });

    // Expecting multiple matches (frame title and footer button)
    expect(screen.getAllByText('Claude Code').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Alpine Linux').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Gemini Agent').length).toBeGreaterThan(0);
  });
});
