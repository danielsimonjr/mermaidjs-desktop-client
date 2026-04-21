import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { debounce } from '../../src/utils/debounce';

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('delays the call until the wait has elapsed', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d('a');
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledExactlyOnceWith('a');
  });

  it('collapses rapid calls to only the last invocation', () => {
    const fn = vi.fn();
    const d = debounce(fn, 50);
    d(1);
    d(2);
    d(3);
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledExactlyOnceWith(3);
  });

  it('preserves arg types (multi-arg)', () => {
    const fn = vi.fn((a: number, b: string) => `${a}:${b}`);
    const d = debounce(fn, 20);
    d(42, 'hi');
    vi.advanceTimersByTime(20);
    expect(fn).toHaveBeenCalledWith(42, 'hi');
  });

  it('handles async callbacks (return value is ignored)', () => {
    const fn = vi.fn(async () => 'result');
    const d = debounce(fn, 10);
    d();
    vi.advanceTimersByTime(10);
    expect(fn).toHaveBeenCalledOnce();
  });
});
