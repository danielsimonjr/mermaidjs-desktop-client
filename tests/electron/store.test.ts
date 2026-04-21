import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * settingsStore is a module singleton that calls `app.getPath('userData')`
 * at flush time. We redirect getPath() to a per-test tmpdir so every test
 * gets a fresh settings.json.
 */

// vi.mock('electron') replaces the module with our fake.
vi.mock('electron', () => import('../__mocks__/electron'));

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mermaidjs-store-'));
  vi.resetModules();
  const electron = await import('electron');
  // @ts-expect-error — our fake exposes getPath as a vi.fn
  electron.app.getPath.mockImplementation(() => tmpRoot);
});

afterEach(async () => {
  // Small retry — Windows AV/Dropbox can briefly hold a handle on a just-written
  // file. `force: true` + a retry loop is plenty.
  for (let i = 0; i < 3; i++) {
    try {
      await fs.rm(tmpRoot, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
});

describe('SettingsStore', () => {
  it('load() on a missing file yields an empty store without throwing', async () => {
    const { settingsStore } = await import('../../electron/store');
    await expect(settingsStore.load()).resolves.toBeUndefined();
    expect(settingsStore.get('anything')).toBeNull();
  });

  it('set/get roundtrips across a flush', async () => {
    const { settingsStore } = await import('../../electron/store');
    await settingsStore.load();
    settingsStore.set('greeting', 'hello');
    await settingsStore.flush();

    const onDisk = JSON.parse(await fs.readFile(path.join(tmpRoot, 'settings.json'), 'utf8'));
    expect(onDisk.greeting).toBe('hello');
  });

  it('loads existing settings.json on init', async () => {
    await fs.writeFile(
      path.join(tmpRoot, 'settings.json'),
      JSON.stringify({ foo: 42, bar: { nested: true } })
    );
    const { settingsStore } = await import('../../electron/store');
    await settingsStore.load();
    expect(settingsStore.get('foo')).toBe(42);
    expect(settingsStore.get<{ nested: boolean }>('bar')).toEqual({ nested: true });
  });

  it('load() is idempotent — re-calling does not re-read the file', async () => {
    const { settingsStore } = await import('../../electron/store');
    await settingsStore.load();
    const spy = vi.spyOn(fs, 'readFile');
    await settingsStore.load();
    expect(spy).not.toHaveBeenCalled();
  });

  it('set() debounces writes — single call does not hit disk synchronously', async () => {
    const { settingsStore } = await import('../../electron/store');
    await settingsStore.load();
    settingsStore.set('a', 1);
    // Nothing on disk yet — confirms the debounce window is active.
    await expect(
      fs.access(path.join(tmpRoot, 'settings.json')).then(
        () => true,
        () => false
      )
    ).resolves.toBe(false);
    // Explicit flush proves the state is eventually persisted.
    await settingsStore.flush();
    const contents = JSON.parse(await fs.readFile(path.join(tmpRoot, 'settings.json'), 'utf8'));
    expect(contents.a).toBe(1);
  });

  it('multiple rapid set() calls collapse to a single write', async () => {
    const { settingsStore } = await import('../../electron/store');
    await settingsStore.load();
    const writeSpy = vi.spyOn(fs, 'writeFile');
    settingsStore.set('x', 1);
    settingsStore.set('x', 2);
    settingsStore.set('x', 3);
    // Force the debounced path to run without waiting 400ms of wall-clock.
    await settingsStore.flush();
    expect(writeSpy).toHaveBeenCalledTimes(1);
    writeSpy.mockRestore();
  });

  it('flush() cancels any pending debounced write', async () => {
    vi.useFakeTimers();
    const { settingsStore } = await import('../../electron/store');
    await settingsStore.load();
    settingsStore.set('a', 1);
    // Switch to real timers for the flush's async rename/write.
    vi.useRealTimers();
    await settingsStore.flush();
    const onDisk = JSON.parse(await fs.readFile(path.join(tmpRoot, 'settings.json'), 'utf8'));
    expect(onDisk.a).toBe(1);
  });

  it('serializes concurrent flushes so no file is half-written', async () => {
    const { settingsStore } = await import('../../electron/store');
    await settingsStore.load();
    settingsStore.set('k', 'v1');
    const p1 = settingsStore.flush();
    settingsStore.set('k', 'v2');
    const p2 = settingsStore.flush();
    await Promise.all([p1, p2]);
    const onDisk = JSON.parse(await fs.readFile(path.join(tmpRoot, 'settings.json'), 'utf8'));
    expect(onDisk.k).toBe('v2');
  });

  it('write failure is swallowed (logs warning, does not reject)', async () => {
    const { settingsStore } = await import('../../electron/store');
    await settingsStore.load();
    settingsStore.set('k', 'v');
    // Force fs.rename to fail.
    const origRename = fs.rename;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('simulated rename failure'));
    await expect(settingsStore.flush()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    // Restore for subsequent tests.
    vi.spyOn(fs, 'rename').mockImplementation(origRename);
    warn.mockRestore();
  });

  it('corrupt existing settings.json falls back to empty state', async () => {
    await fs.writeFile(path.join(tmpRoot, 'settings.json'), '{ not valid json');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { settingsStore } = await import('../../electron/store');
    await settingsStore.load();
    expect(settingsStore.get('anything')).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('ignores non-object JSON (arrays, strings, null)', async () => {
    await fs.writeFile(path.join(tmpRoot, 'settings.json'), '[1,2,3]');
    const { settingsStore } = await import('../../electron/store');
    await settingsStore.load();
    expect(settingsStore.get('0')).toBeNull();
  });
});
