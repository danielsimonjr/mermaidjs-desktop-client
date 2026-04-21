import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { showToast } from '../../src/ui/toast';

describe('showToast', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('appends a .toast element with the message', () => {
    showToast('hello');
    const toast = document.querySelector('.toast');
    expect(toast?.textContent).toBe('hello');
  });

  it('sets data-toast-level based on the level arg', () => {
    showToast('ok', 'success');
    expect(document.querySelector('.toast')?.getAttribute('data-toast-level')).toBe('success');
  });

  it('defaults to info level', () => {
    showToast('msg');
    expect(document.querySelector('.toast')?.getAttribute('data-toast-level')).toBe('info');
  });

  it('removes itself after the duration', () => {
    showToast('gone soon', 'info', 500);
    expect(document.querySelectorAll('.toast')).toHaveLength(1);
    vi.advanceTimersByTime(500);
    expect(document.querySelectorAll('.toast')).toHaveLength(0);
  });

  it('replaces an existing toast (no stacking)', () => {
    showToast('first', 'info', 2000);
    showToast('second', 'info', 2000);
    const toasts = document.querySelectorAll('.toast');
    expect(toasts).toHaveLength(1);
    expect(toasts[0].textContent).toBe('second');
  });
});
