import { describe, it, expect, vi } from 'vitest';

import {
  loadSettingsStore,
  setupWindowPersistence,
  loadEditorZoom,
  saveEditorZoom,
} from '../../src/window/state';

describe('window/state', () => {
  it('loadSettingsStore returns a handle', async () => {
    const h = await loadSettingsStore();
    expect(h).toEqual({ ready: true });
  });

  it('setupWindowPersistence is a no-op (main owns bounds)', async () => {
    const h = (await loadSettingsStore())!;
    await expect(setupWindowPersistence(h, null, 400)).resolves.toBeUndefined();
    // Should not have touched the store API.
    expect(window.api.store.set).not.toHaveBeenCalled();
  });

  it('loadEditorZoom returns the stored numeric value', async () => {
    const h = (await loadSettingsStore())!;
    vi.mocked(window.api.store.get).mockResolvedValueOnce(1.5);
    const v = await loadEditorZoom(h);
    expect(v).toBe(1.5);
    expect(window.api.store.get).toHaveBeenCalledWith('editorZoom');
  });

  it('loadEditorZoom returns null for non-numeric values', async () => {
    const h = (await loadSettingsStore())!;
    vi.mocked(window.api.store.get).mockResolvedValueOnce('not a number');
    const v = await loadEditorZoom(h);
    expect(v).toBeNull();
  });

  it('loadEditorZoom returns null for Infinity / NaN', async () => {
    const h = (await loadSettingsStore())!;
    vi.mocked(window.api.store.get).mockResolvedValueOnce(Number.POSITIVE_INFINITY);
    expect(await loadEditorZoom(h)).toBeNull();
    vi.mocked(window.api.store.get).mockResolvedValueOnce(Number.NaN);
    expect(await loadEditorZoom(h)).toBeNull();
  });

  it('loadEditorZoom returns null + logs if the store rejects', async () => {
    const h = (await loadSettingsStore())!;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(window.api.store.get).mockRejectedValueOnce(new Error('ipc down'));
    expect(await loadEditorZoom(h)).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('saveEditorZoom writes through to the store', async () => {
    const h = (await loadSettingsStore())!;
    await saveEditorZoom(h, 1.25);
    expect(window.api.store.set).toHaveBeenCalledWith('editorZoom', 1.25);
  });

  it('saveEditorZoom swallows store errors + logs', async () => {
    const h = (await loadSettingsStore())!;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(window.api.store.set).mockRejectedValueOnce(new Error('disk full'));
    await expect(saveEditorZoom(h, 1.1)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
