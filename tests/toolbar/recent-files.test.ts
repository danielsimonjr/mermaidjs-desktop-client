import { describe, it, expect, vi } from 'vitest';

import { basenameOf, createRecentFiles } from '../../src/toolbar/recent-files';

describe('basenameOf', () => {
  it('returns the last path segment', () => {
    expect(basenameOf('/a/b/c.mmd')).toBe('c.mmd');
    expect(basenameOf('C:\\Users\\me\\diagram.mmd')).toBe('diagram.mmd');
    expect(basenameOf('single')).toBe('single');
  });

  it('handles trailing slashes (returns empty string, caller decides)', () => {
    expect(basenameOf('/a/b/')).toBe('');
  });
});

describe('createRecentFiles', () => {
  it('read returns empty when store has nothing', async () => {
    vi.mocked(window.api.store.get).mockResolvedValueOnce(null);
    const rf = createRecentFiles();
    expect(await rf.read()).toEqual([]);
  });

  it('read ignores non-array values', async () => {
    vi.mocked(window.api.store.get).mockResolvedValueOnce('wrong type');
    const rf = createRecentFiles();
    expect(await rf.read()).toEqual([]);
  });

  it('read filters out non-string entries', async () => {
    vi.mocked(window.api.store.get).mockResolvedValueOnce(['ok', 42, null, '', 'also-ok']);
    const rf = createRecentFiles();
    expect(await rf.read()).toEqual(['ok', 'also-ok']);
  });

  it('read swallows store errors', async () => {
    vi.mocked(window.api.store.get).mockRejectedValueOnce(new Error('boom'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rf = createRecentFiles();
    expect(await rf.read()).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('push prepends a new path and persists', async () => {
    vi.mocked(window.api.store.get).mockResolvedValueOnce(['b.mmd', 'c.mmd']);
    const rf = createRecentFiles();
    const next = await rf.push('a.mmd');
    expect(next).toEqual(['a.mmd', 'b.mmd', 'c.mmd']);
    expect(window.api.store.set).toHaveBeenCalledWith('recentFiles', [
      'a.mmd',
      'b.mmd',
      'c.mmd',
    ]);
  });

  it('push deduplicates by moving existing to front', async () => {
    vi.mocked(window.api.store.get).mockResolvedValueOnce(['x', 'y', 'z']);
    const rf = createRecentFiles();
    const next = await rf.push('y');
    expect(next).toEqual(['y', 'x', 'z']);
  });

  it('push caps the list at MAX_ENTRIES (10)', async () => {
    const existing = Array.from({ length: 10 }, (_, i) => `f${i}.mmd`);
    vi.mocked(window.api.store.get).mockResolvedValueOnce(existing);
    const rf = createRecentFiles();
    const next = await rf.push('new.mmd');
    expect(next).toHaveLength(10);
    expect(next[0]).toBe('new.mmd');
    expect(next).not.toContain('f9.mmd'); // oldest dropped
  });

  it('push ignores empty paths', async () => {
    vi.mocked(window.api.store.get).mockResolvedValueOnce(['keep.mmd']);
    const rf = createRecentFiles();
    const next = await rf.push('');
    expect(next).toEqual(['keep.mmd']);
  });

  it('clear writes an empty array', async () => {
    const rf = createRecentFiles();
    await rf.clear();
    expect(window.api.store.set).toHaveBeenCalledWith('recentFiles', []);
  });

  it('remove filters out a specific path', async () => {
    vi.mocked(window.api.store.get).mockResolvedValueOnce(['a', 'b', 'c']);
    const rf = createRecentFiles();
    const next = await rf.remove('b');
    expect(next).toEqual(['a', 'c']);
  });

  it('write failures are swallowed with a warning', async () => {
    vi.mocked(window.api.store.get).mockResolvedValueOnce([]);
    vi.mocked(window.api.store.set).mockRejectedValueOnce(new Error('disk full'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rf = createRecentFiles();
    await expect(rf.push('a')).resolves.toBeTruthy();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
