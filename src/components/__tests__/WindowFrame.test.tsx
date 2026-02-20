import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WindowFrame } from '../WindowFrame';
import React from 'react';
import '@testing-library/jest-dom';

// Mock dnd-kit
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
}));

describe('WindowFrame', () => {
  const props = {
    id: 'test-frame',
    title: 'Test Window',
    onClose: vi.fn(),
    onMinimize: vi.fn(),
    onMaximize: vi.fn(),
    onRestore: vi.fn(),
    onShare: vi.fn(),
    isMaximized: false,
    isMinimized: false,
  };

  it('renders title and controls', () => {
    render(<WindowFrame {...props}><div>Content</div></WindowFrame>);
    expect(screen.getByText('Test Window')).toBeTruthy();
    expect(screen.getByText('Content')).toBeTruthy();
  });

  it('calls minimize when button clicked', () => {
    render(<WindowFrame {...props}><div>Content</div></WindowFrame>);
    const minBtn = screen.getByTitle('Minimize');
    fireEvent.click(minBtn);
    expect(props.onMinimize).toHaveBeenCalled();
  });

  it('calls maximize when button clicked', () => {
    render(<WindowFrame {...props}><div>Content</div></WindowFrame>);
    const maxBtn = screen.getByTitle('Maximize');
    fireEvent.click(maxBtn);
    expect(props.onMaximize).toHaveBeenCalled();
  });

  it('hides content when minimized', () => {
    render(<WindowFrame {...props} isMinimized={true}><div>HiddenContent</div></WindowFrame>);
    // Content is wrapped in a div with 'hidden' class
    const content = screen.getByText('HiddenContent');
    expect(content.parentElement).toHaveClass('hidden');
  });
});
