// Hand-rolled fake of the Electron module surface we use.
// Tests register it per-file via `vi.mock('electron', () => import('../__mocks__/electron'))`.
//
// Design goal: faithful enough that the real main.ts / preload.ts run unchanged
// under Node + Vitest, letting us assert on IPC calls, window lifecycle events,
// contextBridge exposure, etc. without spawning Electron.

import { EventEmitter } from 'node:events';
import { vi } from 'vitest';

// ---- BrowserWindow fake ----
export class BrowserWindow extends EventEmitter {
  static instances: BrowserWindow[] = [];
  static focusedWindow: BrowserWindow | null = null;

  static getAllWindows(): BrowserWindow[] {
    return [...BrowserWindow.instances];
  }

  static getFocusedWindow(): BrowserWindow | null {
    return BrowserWindow.focusedWindow;
  }

  static reset(): void {
    BrowserWindow.instances = [];
    BrowserWindow.focusedWindow = null;
  }

  readonly webContents = Object.assign(new EventEmitter(), {
    setWindowOpenHandler: vi.fn(),
  });

  private bounds = { x: 0, y: 0, width: 800, height: 600 };
  private maximized = false;
  private destroyed = false;

  constructor(public readonly options: Record<string, unknown> = {}) {
    super();
    BrowserWindow.instances.push(this);
    BrowserWindow.focusedWindow = this;
  }

  loadURL = vi.fn(async (_url: string) => {});
  show = vi.fn(() => this.emit('ready-to-show'));
  focus = vi.fn();
  close = vi.fn(() => {
    this.emit('close');
    this.destroyed = true;
    this.emit('closed');
    BrowserWindow.instances = BrowserWindow.instances.filter((w) => w !== this);
    if (BrowserWindow.focusedWindow === this) BrowserWindow.focusedWindow = null;
  });

  isDestroyed(): boolean {
    return this.destroyed;
  }
  isMaximized(): boolean {
    return this.maximized;
  }
  maximize(): void {
    this.maximized = true;
  }
  getBounds() {
    return { ...this.bounds };
  }
  getNormalBounds() {
    return { ...this.bounds };
  }
  setBounds(next: { x?: number; y?: number; width?: number; height?: number }): void {
    this.bounds = { ...this.bounds, ...next };
  }

  // Test helpers — not present on real BrowserWindow, used by test code.
  triggerResize(): void {
    this.emit('resize');
  }
  triggerMove(): void {
    this.emit('move');
  }
}

// ---- app fake ----
class AppFake extends EventEmitter {
  private readyPromise: Promise<void> | null = null;
  packaged = false;

  get isPackaged(): boolean {
    return this.packaged;
  }

  getName = vi.fn(() => 'MermaidJS Desktop');
  getVersion = vi.fn(() => '2.4.0');
  getPath = vi.fn((key: string) => {
    if (key === 'userData') return `/tmp/mermaidjs-test-userdata`;
    return `/tmp/mermaidjs-test-${key}`;
  });
  quit = vi.fn();
  exit = vi.fn();

  whenReady(): Promise<void> {
    this.readyPromise ??= Promise.resolve();
    return this.readyPromise;
  }

  reset(): void {
    this.removeAllListeners();
    this.packaged = false;
    vi.mocked(this.getName).mockClear();
    vi.mocked(this.getVersion).mockClear();
    vi.mocked(this.getPath).mockClear();
    vi.mocked(this.quit).mockClear();
    vi.mocked(this.exit).mockClear();
  }
}

export const app = new AppFake();

// ---- dialog fake ----
export const dialog = {
  showMessageBox: vi.fn(async () => ({ response: 0 })),
  showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: ['/path/from/picker'] })),
  showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: '/path/from/picker' })),
};

// ---- shell fake ----
export const shell = {
  openExternal: vi.fn(async (_url: string) => {}),
};

// ---- ipcMain fake ----
class IpcMainFake {
  readonly handlers = new Map<string, (...args: unknown[]) => unknown>();

  handle(channel: string, listener: (...args: unknown[]) => unknown): void {
    this.handlers.set(channel, listener);
  }

  removeHandler(channel: string): void {
    this.handlers.delete(channel);
  }

  /** Test helper: invoke a registered handler with fake event + args. */
  async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    const h = this.handlers.get(channel);
    if (!h) throw new Error(`ipcMain: no handler for "${channel}"`);
    return h({} as unknown, ...args);
  }

  reset(): void {
    this.handlers.clear();
  }
}

export const ipcMain = new IpcMainFake();

// ---- contextBridge fake ----
export const contextBridge = {
  exposedApis: new Map<string, unknown>(),
  exposeInMainWorld(key: string, api: unknown) {
    contextBridge.exposedApis.set(key, api);
    (globalThis as Record<string, unknown>)[key] = api;
  },
  reset() {
    contextBridge.exposedApis.clear();
  },
};

// ---- ipcRenderer fake (used by preload.ts) ----
export const ipcRenderer = {
  invoke: vi.fn(async (_channel: string, ..._args: unknown[]) => undefined),
};

// ---- default export for consumers that use `import electron from 'electron'` ----
export default {
  app,
  BrowserWindow,
  dialog,
  shell,
  ipcMain,
  contextBridge,
  ipcRenderer,
};
