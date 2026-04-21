import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the mermaid module before importing render.ts.
vi.mock('mermaid', () => ({
  default: {
    render: vi.fn(async (_id: string, _src: string, _container: HTMLElement) => ({
      svg: '<svg><g>rendered</g></svg>',
      diagramType: 'flowchart',
    })) as never,
  },
}));

import mermaid from 'mermaid';
import { createPreview } from '../../src/preview/render';

describe('createPreview', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function makePreview() {
    const el = document.createElement('div');
    document.body.appendChild(el);
    return el;
  }

  async function flush() {
    // Advance the 300ms debounce, then drain queued microtasks.
    vi.advanceTimersByTime(300);
    vi.useRealTimers();
    await Promise.resolve();
    await Promise.resolve();
    vi.useFakeTimers();
  }

  it('shows the empty-state message for blank input', async () => {
    const el = makePreview();
    const onEmpty = vi.fn();
    const schedule = createPreview(el, 300, { onRenderEmpty: onEmpty });
    schedule('');
    await flush();
    expect(el.classList.contains('preview-empty')).toBe(true);
    expect(el.textContent).toMatch(/Add Mermaid markup/);
    expect(onEmpty).toHaveBeenCalled();
  });

  it('renders mermaid output on valid input', async () => {
    const el = makePreview();
    const onStart = vi.fn();
    const onSuccess = vi.fn();
    const schedule = createPreview(el, 300, { onRenderStart: onStart, onRenderSuccess: onSuccess });
    schedule('graph TD\n A-->B');
    expect(onStart).toHaveBeenCalledTimes(1);
    await flush();
    expect(mermaid.render).toHaveBeenCalled();
    expect(el.innerHTML).toContain('<svg>');
    expect(onSuccess).toHaveBeenCalled();
  });

  it('shows the error view when mermaid throws', async () => {
    const el = makePreview();
    vi.mocked(mermaid.render).mockRejectedValueOnce(new Error('bad syntax'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn();
    const schedule = createPreview(el, 300, { onRenderError: onError });
    schedule('graph invalid');
    await flush();
    expect(el.classList.contains('preview-error')).toBe(true);
    expect(onError).toHaveBeenCalledWith('bad syntax');
    expect(el.textContent).toContain('bad syntax');
    errSpy.mockRestore();
  });

  it('stringifies non-Error throws in the details pane', async () => {
    const el = makePreview();
    vi.mocked(mermaid.render).mockRejectedValueOnce('plain string');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn();
    const schedule = createPreview(el, 300, { onRenderError: onError });
    schedule('graph invalid');
    await flush();
    expect(onError).toHaveBeenCalledWith('plain string');
    errSpy.mockRestore();
  });

  it('uses "Unknown error" when throw value is null/undefined', async () => {
    const el = makePreview();
    vi.mocked(mermaid.render).mockRejectedValueOnce(null);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn();
    const schedule = createPreview(el, 300, { onRenderError: onError });
    schedule('graph invalid');
    await flush();
    expect(onError).toHaveBeenCalledWith('Unknown error');
    errSpy.mockRestore();
  });

  it('discards stale renders when a new one arrives first', async () => {
    const el = makePreview();
    // Make the first render slow.
    let resolveFirst!: (v: { svg: string; diagramType: string }) => void;
    vi.mocked(mermaid.render)
      .mockImplementationOnce(
        () => new Promise((r) => { resolveFirst = r as typeof resolveFirst; }) as never
      )
      .mockResolvedValueOnce({ svg: '<svg>second</svg>', diagramType: 'flowchart' } as never);

    const onSuccess = vi.fn();
    const schedule = createPreview(el, 300, { onRenderSuccess: onSuccess });
    schedule('first');
    vi.advanceTimersByTime(300);
    schedule('second');
    vi.advanceTimersByTime(300);
    vi.useRealTimers();
    await Promise.resolve();
    resolveFirst({ svg: '<svg>STALE</svg>', diagramType: 'flowchart' });
    await Promise.resolve();
    await Promise.resolve();
    vi.useFakeTimers();
    // The stale first render must not overwrite the second.
    expect(el.innerHTML).not.toContain('STALE');
  });
});
