import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressOverlay } from '../ProgressOverlay';
import React from 'react';

describe('ProgressOverlay', () => {
  beforeEach(() => {
    // Mock requestAnimationFrame
    vi.stubGlobal('requestAnimationFrame', vi.fn());
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  it('renders when active', () => {
    render(<ProgressOverlay progress={50} stage="Loading" active={true} />);
    expect(screen.getByText('friscy')).toBeTruthy();
    expect(screen.getByText('Loading')).toBeTruthy();
  });

  it('does not render when inactive', () => {
    const { container } = render(<ProgressOverlay progress={50} stage="Loading" active={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders detail text if provided', () => {
    render(<ProgressOverlay progress={50} stage="Loading" detail="Checking files" active={true} />);
    expect(screen.getByText('Checking files')).toBeTruthy();
  });
});
