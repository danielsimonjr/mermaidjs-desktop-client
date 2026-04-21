import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IPC_CHANNELS } from '../../electron/types';

vi.mock('electron', () => import('../__mocks__/electron'));

beforeEach(async () => {
  vi.resetModules();
  // Clear exposed globals between tests.
  delete (globalThis as unknown as { api?: unknown }).api;
});

describe('preload', () => {
  it('exposes all ElectronApi groups on window.api via contextBridge', async () => {
    await import('../../electron/preload');
    const api = (globalThis as unknown as { api?: Record<string, unknown> }).api;
    expect(api).toBeDefined();
    expect(Object.keys(api!).sort()).toEqual(['app', 'dialog', 'fs', 'shell', 'store']);
  });

  // The preload INLINES its own copy of IPC_CHANNELS because it's loaded under
  // sandbox: true, and a sandboxed preload cannot require('./types') — the call
  // throws "module not found" at load time, contextBridge.exposeInMainWorld
  // never runs, and window.api is left undefined in the renderer.
  //
  // This test asserts the two copies stay in lockstep. If someone adds a new
  // channel to electron/types.ts and forgets to mirror it in electron/preload.ts,
  // this will fail loudly with a readable diff instead of every downstream
  // "nothing happens when I click the button" bug.
  it('inlined preload channel strings match electron/types.ts::IPC_CHANNELS exactly', async () => {
    const { promises: fs } = await import('node:fs');
    const { resolve } = await import('node:path');
    const preloadSource = await fs.readFile(
      resolve(process.cwd(), 'electron/preload.ts'),
      'utf8'
    );
    // Extract the `const IPC_CHANNELS = { ... } as const;` literal from the source.
    const match = preloadSource.match(/const IPC_CHANNELS = (\{[\s\S]*?\}) as const;/);
    expect(match, 'preload.ts must contain an inlined `const IPC_CHANNELS = {...} as const;`').toBeTruthy();
    // eval-style parse: the object literal is pure JSON-like content (quoted strings + nested braces).
    // Rewrite to valid JSON by quoting bare keys, then parse.
    const normalized = match![1]
      .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3')
      .replace(/'([^']*)'/g, '"$1"')
      .replace(/,(\s*[}\]])/g, '$1');
    const inlined = JSON.parse(normalized);
    expect(inlined).toEqual(IPC_CHANNELS);
  });

  it('app.getName calls ipcRenderer.invoke with the correct channel', async () => {
    const electron = await import('electron');
    vi.mocked(electron.ipcRenderer.invoke).mockResolvedValueOnce('Test App');
    await import('../../electron/preload');
    const api = (globalThis as unknown as { api: { app: { getName(): Promise<string> } } }).api;
    await expect(api.app.getName()).resolves.toBe('Test App');
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(IPC_CHANNELS.app.getName);
  });

  it('shell.open forwards its argument', async () => {
    const electron = await import('electron');
    await import('../../electron/preload');
    const api = (globalThis as unknown as { api: { shell: { open(u: string): Promise<void> } } }).api;
    await api.shell.open('https://example.com');
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      IPC_CHANNELS.shell.open,
      'https://example.com'
    );
  });

  it('dialog.ask passes message + options through', async () => {
    const electron = await import('electron');
    await import('../../electron/preload');
    const api = (globalThis as unknown as {
      api: { dialog: { ask(m: string, o?: unknown): Promise<boolean> } };
    }).api;
    await api.dialog.ask('confirm?', { title: 'T' });
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      IPC_CHANNELS.dialog.ask,
      'confirm?',
      { title: 'T' }
    );
  });

  it('dialog.showOpenDialog and showSaveDialog pass options', async () => {
    const electron = await import('electron');
    await import('../../electron/preload');
    const api = (globalThis as unknown as {
      api: {
        dialog: {
          showOpenDialog(o?: unknown): Promise<unknown>;
          showSaveDialog(o?: unknown): Promise<unknown>;
        };
      };
    }).api;
    await api.dialog.showOpenDialog({ title: 'Pick' });
    await api.dialog.showSaveDialog({ defaultPath: 'x.mmd' });
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      IPC_CHANNELS.dialog.showOpenDialog,
      { title: 'Pick' }
    );
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      IPC_CHANNELS.dialog.showSaveDialog,
      { defaultPath: 'x.mmd' }
    );
  });

  it('fs bridge forwards text and binary writes', async () => {
    const electron = await import('electron');
    await import('../../electron/preload');
    const api = (globalThis as unknown as {
      api: {
        fs: {
          readTextFile(p: string): Promise<string>;
          writeTextFile(p: string, c: string): Promise<void>;
          writeFile(p: string, c: Uint8Array): Promise<void>;
        };
      };
    }).api;

    await api.fs.readTextFile('/a');
    await api.fs.writeTextFile('/a', 'hi');
    const bytes = new Uint8Array([1, 2, 3]);
    await api.fs.writeFile('/a.png', bytes);

    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(IPC_CHANNELS.fs.readTextFile, '/a');
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      IPC_CHANNELS.fs.writeTextFile,
      '/a',
      'hi'
    );
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      IPC_CHANNELS.fs.writeFile,
      '/a.png',
      bytes
    );
  });

  it('store bridge exposes get/set/save', async () => {
    const electron = await import('electron');
    await import('../../electron/preload');
    const api = (globalThis as unknown as {
      api: {
        store: {
          get(k: string): Promise<unknown>;
          set(k: string, v: unknown): Promise<void>;
          save(): Promise<void>;
        };
      };
    }).api;

    await api.store.get('k');
    await api.store.set('k', 42);
    await api.store.save();
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(IPC_CHANNELS.store.get, 'k');
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(IPC_CHANNELS.store.set, 'k', 42);
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(IPC_CHANNELS.store.save);
  });
});
