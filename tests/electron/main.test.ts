import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { IPC_CHANNELS } from '../../electron/types';

vi.mock('electron', () => import('../__mocks__/electron'));

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mermaidjs-main-'));
  vi.resetModules();
  const electron = await import('electron');
  // Redirect getPath('userData') into our tmp root.
  // @ts-expect-error — fake exposes getPath as a vi.fn
  electron.app.getPath.mockImplementation(() => tmpRoot);
  // @ts-expect-error — fake exposes reset helpers
  electron.app.reset();
  // @ts-expect-error
  electron.BrowserWindow.reset();
  // @ts-expect-error
  electron.ipcMain.reset();
});

afterEach(async () => {
  for (let i = 0; i < 3; i++) {
    try {
      await fs.rm(tmpRoot, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
});

async function bootMain() {
  // Import main.ts — this registers IPC handlers and schedules window creation.
  await import('../../electron/main');
  const electron = await import('electron');
  await electron.app.whenReady();
  // createMainWindow now runs settings-load concurrently with BrowserWindow
  // construction, so the window exists before setBounds / event listeners /
  // loadURL have been applied. Poll for loadURL — the last thing the flow
  // does — so the tests see a fully-wired window.
  for (let i = 0; i < 100; i++) {
    // @ts-expect-error — static on fake
    const win = electron.BrowserWindow.instances[0];
    if (win && vi.mocked(win.loadURL).mock.calls.length > 0) break;
    await new Promise((r) => setTimeout(r, 10));
  }
  return electron;
}

/** Poll until the settings.json file contains a given predicate-matching payload. */
async function waitForSettings<T extends Record<string, unknown>>(
  pred: (d: T) => boolean,
  timeoutMs = 4000
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const raw = await fs.readFile(path.join(tmpRoot, 'settings.json'), 'utf8');
      const parsed = JSON.parse(raw) as T;
      if (pred(parsed)) return parsed;
    } catch {
      /* file not ready yet */
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('settings.json did not match predicate within timeout');
}

describe('electron main — lifecycle', () => {
  it('creates a BrowserWindow after app is ready', async () => {
    const electron = await bootMain();
    // @ts-expect-error — static on fake
    expect(electron.BrowserWindow.instances).toHaveLength(1);
  });

  it('restores saved window bounds from settings.json', async () => {
    await fs.writeFile(
      path.join(tmpRoot, 'settings.json'),
      JSON.stringify({ windowState: { width: 1200, height: 800, x: 100, y: 50 } })
    );
    const electron = await bootMain();
    // @ts-expect-error
    const win = electron.BrowserWindow.instances[0]!;
    // Bounds are applied via setBounds post-construction (settings read runs
    // concurrently with the BrowserWindow ctor for faster cold start).
    const bounds = win.getBounds();
    expect(bounds.width).toBe(1200);
    expect(bounds.height).toBe(800);
    expect(bounds.x).toBe(100);
    expect(bounds.y).toBe(50);
  });

  it('restores maximized state when saved', async () => {
    await fs.writeFile(
      path.join(tmpRoot, 'settings.json'),
      JSON.stringify({ windowState: { width: 800, height: 600, maximized: true } })
    );
    const electron = await bootMain();
    // @ts-expect-error
    const win = electron.BrowserWindow.instances[0]!;
    expect(win.isMaximized()).toBe(true);
  });

  it('falls back to default 800x600 when settings.json absent', async () => {
    const electron = await bootMain();
    // @ts-expect-error
    const win = electron.BrowserWindow.instances[0]!;
    const bounds = win.getBounds();
    expect(bounds.width).toBe(800);
    expect(bounds.height).toBe(600);
  });

  it('ignores non-finite saved dimensions (finiteOr fallback)', async () => {
    await fs.writeFile(
      path.join(tmpRoot, 'settings.json'),
      JSON.stringify({ windowState: { width: Number.POSITIVE_INFINITY, height: 600 } })
    );
    const electron = await bootMain();
    // @ts-expect-error
    const win = electron.BrowserWindow.instances[0]!;
    expect(win.getBounds().width).toBe(800); // default fallback
  });

  it('shows and focuses the window on ready-to-show', async () => {
    const electron = await bootMain();
    // @ts-expect-error
    const win = electron.BrowserWindow.instances[0]!;
    // Main registers a once('ready-to-show') listener; trigger it.
    win.emit('ready-to-show');
    expect(win.show).toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
  });

  it('loads the Vite dev URL when not packaged', async () => {
    const electron = await bootMain();
    // @ts-expect-error
    const win = electron.BrowserWindow.instances[0]!;
    expect(win.loadURL).toHaveBeenCalledWith('http://localhost:5173');
  });

  it('loads dist/index.html via file:// when packaged', async () => {
    const electron = await import('electron');
    // @ts-expect-error — fake field
    electron.app.packaged = true;
    const booted = await bootMain();
    // @ts-expect-error
    const win = booted.BrowserWindow.instances[0]!;
    const firstArg = (win.loadURL as unknown as { mock: { calls: string[][] } }).mock.calls[0]![0];
    expect(firstArg).toMatch(/^file:\/\//);
    expect(firstArg).toContain('index.html');
  });

  it('blocks navigation to arbitrary URLs', async () => {
    const electron = await bootMain();
    // @ts-expect-error
    const win = electron.BrowserWindow.instances[0]!;
    const fakeEvent = { preventDefault: vi.fn() };
    win.webContents.emit('will-navigate', fakeEvent, 'https://evil.example.com');
    expect(fakeEvent.preventDefault).toHaveBeenCalled();
  });

  it('allows navigation to the dev URL in non-packaged mode', async () => {
    const electron = await bootMain();
    // @ts-expect-error
    const win = electron.BrowserWindow.instances[0]!;
    const fakeEvent = { preventDefault: vi.fn() };
    win.webContents.emit('will-navigate', fakeEvent, 'http://localhost:5173/');
    expect(fakeEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('window-open handler delegates to shell.openExternal and denies in-renderer open', async () => {
    const electron = await bootMain();
    // @ts-expect-error
    const win = electron.BrowserWindow.instances[0]!;
    const call = vi.mocked(win.webContents.setWindowOpenHandler).mock.calls[0]!;
    const handler = call[0] as (x: { url: string }) => { action: string };
    const result = handler({ url: 'https://example.com' });
    expect(result.action).toBe('deny');
    expect(electron.shell.openExternal).toHaveBeenCalledWith('https://example.com');
  });

  it('persists window state on move event (via debounce)', async () => {
    const electron = await bootMain();
    // @ts-expect-error
    const win = electron.BrowserWindow.instances[0]!;
    win.setBounds({ x: 111, y: 222, width: 900, height: 700 });
    win.emit('move');
    const onDisk = await waitForSettings<{ windowState?: Record<string, number> }>(
      (d) => d.windowState?.x === 111
    );
    expect(onDisk.windowState).toMatchObject({ x: 111, y: 222, width: 900, height: 700 });
  });

  it('persists maximized flag correctly', async () => {
    const electron = await bootMain();
    // @ts-expect-error
    const win = electron.BrowserWindow.instances[0]!;
    win.maximize();
    win.emit('resize');
    const onDisk = await waitForSettings<{ windowState?: { maximized?: boolean } }>(
      (d) => d.windowState?.maximized === true
    );
    expect(onDisk.windowState?.maximized).toBe(true);
  });

  it('close cancels a pending debounced persist timer', async () => {
    const electron = await bootMain();
    // @ts-expect-error
    const win = electron.BrowserWindow.instances[0]!;
    win.setBounds({ x: 9, y: 9, width: 777, height: 555 });
    // Move first (schedules the 400ms persist timer) then immediately close.
    win.emit('move');
    win.close();
    // The close handler forces an immediate persist and awaits flush.
    const onDisk = await waitForSettings<{ windowState?: Record<string, number> }>(
      (d) => d.windowState?.x === 9
    );
    expect(onDisk.windowState?.x).toBe(9);
  });

  it('flushes settings on window close', async () => {
    const electron = await bootMain();
    // @ts-expect-error
    const win = electron.BrowserWindow.instances[0]!;
    win.setBounds({ x: 7, y: 8, width: 640, height: 480 });
    win.close(); // emits 'close' then 'closed'
    const onDisk = await waitForSettings<{ windowState?: unknown }>((d) => !!d.windowState);
    expect(onDisk.windowState).toBeDefined();
  });

  it('app "activate" recreates the window when none are open (macOS pattern)', async () => {
    const electron = await bootMain();
    // @ts-expect-error
    const win = electron.BrowserWindow.instances[0]!;
    win.close();
    // @ts-expect-error
    expect(electron.BrowserWindow.instances).toHaveLength(0);
    electron.app.emit('activate');
    await new Promise((r) => setTimeout(r, 30));
    // @ts-expect-error
    expect(electron.BrowserWindow.instances.length).toBeGreaterThanOrEqual(1);
  });

  async function waitForQuit(electron: typeof import('electron'), expect: boolean): Promise<void> {
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      if (vi.mocked(electron.app.quit).mock.calls.length > 0) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    if (expect) throw new Error('app.quit was not called within 2s');
  }

  it('app.quit is called on window-all-closed (non-darwin)', async () => {
    const orig = Object.getOwnPropertyDescriptor(process, 'platform')!;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    const electron = await bootMain();
    // @ts-expect-error
    const win = electron.BrowserWindow.instances[0]!;
    win.close();
    electron.app.emit('window-all-closed');
    await waitForQuit(electron, true);
    expect(electron.app.quit).toHaveBeenCalled();
    Object.defineProperty(process, 'platform', orig);
  });

  it('app.quit is NOT called on darwin (Mac keep-alive pattern)', async () => {
    const orig = Object.getOwnPropertyDescriptor(process, 'platform')!;
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    const electron = await bootMain();
    // @ts-expect-error
    const win = electron.BrowserWindow.instances[0]!;
    win.close();
    electron.app.emit('window-all-closed');
    // Give it time to run; then confirm it still wasn't called.
    await new Promise((r) => setTimeout(r, 300));
    expect(electron.app.quit).not.toHaveBeenCalled();
    Object.defineProperty(process, 'platform', orig);
  });
});

describe('electron main — IPC handlers', () => {
  async function invoke(channel: string, ...args: unknown[]) {
    const electron = await import('electron');
    // @ts-expect-error
    return electron.ipcMain.invoke(channel, ...args);
  }

  it('app:getName returns app.getName()', async () => {
    await bootMain();
    expect(await invoke(IPC_CHANNELS.app.getName)).toBe('MermaidJS Desktop');
  });

  it('app:getVersion returns app.getVersion()', async () => {
    await bootMain();
    expect(await invoke(IPC_CHANNELS.app.getVersion)).toBe('2.4.0');
  });

  it('shell:open forwards to shell.openExternal', async () => {
    const electron = await bootMain();
    await invoke(IPC_CHANNELS.shell.open, 'https://x.com');
    expect(electron.shell.openExternal).toHaveBeenCalledWith('https://x.com');
  });

  it('dialog:ask maps response=0 to true', async () => {
    const electron = await bootMain();
    vi.mocked(electron.dialog.showMessageBox).mockResolvedValueOnce({ response: 0, checkboxChecked: false });
    const ok = await invoke(IPC_CHANNELS.dialog.ask, 'proceed?');
    expect(ok).toBe(true);
  });

  it('dialog:ask maps response=1 to false', async () => {
    const electron = await bootMain();
    vi.mocked(electron.dialog.showMessageBox).mockResolvedValueOnce({ response: 1, checkboxChecked: false });
    const ok = await invoke(IPC_CHANNELS.dialog.ask, 'proceed?');
    expect(ok).toBe(false);
  });

  it('dialog:ask passes custom labels + kind through', async () => {
    const electron = await bootMain();
    await invoke(IPC_CHANNELS.dialog.ask, 'delete?', {
      title: 'Confirm',
      kind: 'warning',
      okLabel: 'Delete',
      cancelLabel: 'Keep',
    });
    expect(electron.dialog.showMessageBox).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'warning',
        title: 'Confirm',
        buttons: ['Delete', 'Keep'],
      })
    );
  });

  it('dialog:showOpenDialog (single) returns first filePath', async () => {
    const electron = await bootMain();
    vi.mocked(electron.dialog.showOpenDialog).mockResolvedValueOnce({
      canceled: false,
      filePaths: ['/picked.mmd'],
    });
    const res = await invoke(IPC_CHANNELS.dialog.showOpenDialog, {});
    expect(res).toBe('/picked.mmd');
  });

  it('dialog:showOpenDialog (multiple) returns the full array', async () => {
    const electron = await bootMain();
    vi.mocked(electron.dialog.showOpenDialog).mockResolvedValueOnce({
      canceled: false,
      filePaths: ['/a', '/b'],
    });
    const res = await invoke(IPC_CHANNELS.dialog.showOpenDialog, { multiple: true });
    expect(res).toEqual(['/a', '/b']);
  });

  it('dialog:showOpenDialog (directory) uses openDirectory property', async () => {
    const electron = await bootMain();
    vi.mocked(electron.dialog.showOpenDialog).mockResolvedValueOnce({
      canceled: false,
      filePaths: ['/some/dir'],
    });
    await invoke(IPC_CHANNELS.dialog.showOpenDialog, { directory: true });
    expect(electron.dialog.showOpenDialog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ properties: ['openDirectory'] })
    );
  });

  it('dialog:showOpenDialog cancel returns null', async () => {
    const electron = await bootMain();
    vi.mocked(electron.dialog.showOpenDialog).mockResolvedValueOnce({
      canceled: true,
      filePaths: [],
    });
    expect(await invoke(IPC_CHANNELS.dialog.showOpenDialog, {})).toBeNull();
  });

  it('dialog:showSaveDialog returns filePath or null', async () => {
    const electron = await bootMain();
    vi.mocked(electron.dialog.showSaveDialog).mockResolvedValueOnce({
      canceled: false,
      filePath: '/save/here.mmd',
    });
    expect(await invoke(IPC_CHANNELS.dialog.showSaveDialog, {})).toBe('/save/here.mmd');
    vi.mocked(electron.dialog.showSaveDialog).mockResolvedValueOnce({
      canceled: true,
      filePath: '',
    });
    expect(await invoke(IPC_CHANNELS.dialog.showSaveDialog, {})).toBeNull();
  });

  it('fs:readTextFile reads utf8', async () => {
    await bootMain();
    const p = path.join(tmpRoot, 'in.txt');
    await fs.writeFile(p, 'hello', 'utf8');
    expect(await invoke(IPC_CHANNELS.fs.readTextFile, p)).toBe('hello');
  });

  it('fs:writeTextFile writes utf8', async () => {
    await bootMain();
    const p = path.join(tmpRoot, 'out.txt');
    await invoke(IPC_CHANNELS.fs.writeTextFile, p, 'bye');
    expect(await fs.readFile(p, 'utf8')).toBe('bye');
  });

  it('fs:writeFile writes raw bytes', async () => {
    await bootMain();
    const p = path.join(tmpRoot, 'out.bin');
    const bytes = new Uint8Array([0xca, 0xfe, 0xba, 0xbe]);
    await invoke(IPC_CHANNELS.fs.writeFile, p, bytes);
    const read = await fs.readFile(p);
    expect(Array.from(read)).toEqual([0xca, 0xfe, 0xba, 0xbe]);
  });

  it('store:get / set / save roundtrip', async () => {
    await bootMain();
    await invoke(IPC_CHANNELS.store.set, 'hello', 'world');
    expect(await invoke(IPC_CHANNELS.store.get, 'hello')).toBe('world');
    await invoke(IPC_CHANNELS.store.save);
    const onDisk = JSON.parse(await fs.readFile(path.join(tmpRoot, 'settings.json'), 'utf8'));
    expect(onDisk.hello).toBe('world');
  });
});
