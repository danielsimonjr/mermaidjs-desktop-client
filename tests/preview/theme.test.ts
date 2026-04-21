import { describe, it, expect, vi } from 'vitest';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
  },
}));

import mermaid from 'mermaid';
import { createMermaidTheme } from '../../src/preview/theme';

describe('createMermaidTheme', () => {
  it('initialize() applies the default when store is empty', async () => {
    vi.mocked(window.api.store.get).mockResolvedValueOnce(null);
    const ctrl = createMermaidTheme();
    const applied = await ctrl.initialize();
    expect(applied).toBe('dark'); // default
    expect(mermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ theme: 'dark' })
    );
  });

  it('initialize() honors a stored theme', async () => {
    vi.mocked(window.api.store.get).mockResolvedValueOnce('forest');
    const ctrl = createMermaidTheme();
    expect(await ctrl.initialize()).toBe('forest');
    expect(ctrl.get()).toBe('forest');
  });

  it('initialize() rejects unknown values', async () => {
    vi.mocked(window.api.store.get).mockResolvedValueOnce('bogus');
    const ctrl = createMermaidTheme();
    const applied = await ctrl.initialize();
    expect(applied).toBe('dark'); // fell through to default
  });

  it('initialize() survives store errors', async () => {
    vi.mocked(window.api.store.get).mockRejectedValueOnce(new Error('no store'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctrl = createMermaidTheme();
    const applied = await ctrl.initialize();
    expect(applied).toBe('dark');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('set() applies, persists, and notifies', async () => {
    const onChange = vi.fn();
    const ctrl = createMermaidTheme(onChange);
    await ctrl.set('neutral');
    expect(ctrl.get()).toBe('neutral');
    expect(mermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ theme: 'neutral' })
    );
    expect(window.api.store.set).toHaveBeenCalledWith('mermaidTheme', 'neutral');
    expect(onChange).toHaveBeenCalledWith('neutral');
  });

  it('set() ignores unknown themes', async () => {
    const ctrl = createMermaidTheme();
    // @ts-expect-error — deliberately invalid
    await ctrl.set('rainbow');
    expect(ctrl.get()).not.toBe('rainbow');
  });

  it('set() swallows store-write errors', async () => {
    vi.mocked(window.api.store.set).mockRejectedValueOnce(new Error('disk full'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctrl = createMermaidTheme();
    await ctrl.set('forest');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('accepts a non-default constructor fallback', async () => {
    const ctrl = createMermaidTheme(undefined, 'neutral');
    vi.mocked(window.api.store.get).mockResolvedValueOnce(null);
    expect(await ctrl.initialize()).toBe('neutral');
  });
});
