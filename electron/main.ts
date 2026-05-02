// Electron main process for MermaidJS Desktop.
// Responsibilities:
//   1. Create the BrowserWindow (with preload script, contextIsolation on, nodeIntegration off).
//   2. Restore saved window bounds on startup; persist on move/resize/close.
//   3. Register IPC handlers that mirror the Tauri plugin surface we replaced.
//
// The renderer never touches `app`, `dialog`, `fs`, or `shell` directly — every privileged
// operation goes through an IPC channel whose contract lives in ./types.ts.

import { promises as fs } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';

// Handle Squirrel.Windows install/uninstall/update events. When this module
// is required, it inspects process.argv for `--squirrel-install`,
// `--squirrel-updated`, `--squirrel-uninstall`, or `--squirrel-obsolete` and
// calls Update.exe with the right flag to create/remove Start Menu + Desktop
// shortcuts. If it matches, it returns true and we MUST quit immediately so
// the installer can continue.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const isSquirrelLifecycleEvent = require('electron-squirrel-startup') as boolean;
if (isSquirrelLifecycleEvent) {
  app.quit();
}

import { settingsStore } from './store';
import {
  type AskOptions,
  IPC_CHANNELS,
  type OpenDialogOptions,
  type SaveDialogOptions,
} from './types';

const WINDOW_STATE_KEY = 'windowState';
const WINDOW_PERSIST_DELAY_MS = 400;

interface SavedWindowState {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  maximized?: boolean;
}

const DEFAULT_WINDOW_SIZE = { width: 800, height: 600 } as const;

let mainWindow: BrowserWindow | null = null;

async function createMainWindow(): Promise<void> {
  // Kick off the settings read concurrently with the BrowserWindow ctor.
  // Both are the slow parts of boot (disk read + spawning the renderer
  // process); running them in parallel shaves whichever finishes first
  // off cold start. show=false means the user never sees the default
  // geometry flash before setBounds applies the saved one.
  const settingsPromise = settingsStore.load();

  mainWindow = new BrowserWindow({
    width: DEFAULT_WINDOW_SIZE.width,
    height: DEFAULT_WINDOW_SIZE.height,
    show: false, // show after 'ready-to-show' to avoid white flash
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  await settingsPromise;
  const saved = settingsStore.get<SavedWindowState>(WINDOW_STATE_KEY) ?? {};
  const width = finiteOr(saved.width, DEFAULT_WINDOW_SIZE.width);
  const height = finiteOr(saved.height, DEFAULT_WINDOW_SIZE.height);

  const nextBounds: { x?: number; y?: number; width: number; height: number } = { width, height };
  if (typeof saved.x === 'number' && typeof saved.y === 'number') {
    nextBounds.x = saved.x;
    nextBounds.y = saved.y;
  }
  mainWindow.setBounds(nextBounds);
  if (saved.maximized) {
    mainWindow.maximize();
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  // Persist bounds on move/resize (debounced) and on close (force flush).
  let persistTimer: NodeJS.Timeout | null = null;
  const schedulePersist = (): void => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(persistNow, WINDOW_PERSIST_DELAY_MS);
  };
  const persistNow = (): void => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const bounds = mainWindow.isMaximized() ? mainWindow.getNormalBounds() : mainWindow.getBounds();
    settingsStore.set(WINDOW_STATE_KEY, {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      maximized: mainWindow.isMaximized(),
    });
  };

  mainWindow.on('resize', schedulePersist);
  mainWindow.on('move', schedulePersist);
  mainWindow.on('close', async () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    persistNow();
    await settingsStore.flush();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Harden navigation — renderer should never navigate away or open arbitrary URLs.
  // Both will-navigate (top-frame nav) and will-redirect (3xx response on the
  // current request) are gated by the same predicate, since a 302 from any
  // IPC-introduced fetch would otherwise navigate the top frame and bypass
  // a will-navigate-only check.
  //
  // Dev-mode allow-list: ONLY the Vite root URL. The previous origin-only
  // check let any path under http://localhost:5173 through, including
  // attacker-introduced paths like /evil.html.
  const ALLOWED_DEV_HREFS = new Set<string>(['http://localhost:5173/']);
  const isAllowedDevNavigation = (url: string): boolean => {
    if (app.isPackaged) return false;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    return ALLOWED_DEV_HREFS.has(parsed.href);
  };
  const guardNavigation = (event: { preventDefault: () => void }, url: string): void => {
    if (!isAllowedDevNavigation(url)) event.preventDefault();
  };
  mainWindow.webContents.on('will-navigate', guardNavigation);
  mainWindow.webContents.on('will-redirect', guardNavigation);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (app.isPackaged) {
    const indexHtml = join(__dirname, '..', 'dist', 'index.html');
    await mainWindow.loadURL(pathToFileURL(indexHtml).toString());
  } else {
    await mainWindow.loadURL('http://localhost:5173');
  }
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : fallback;
}

// ---- Filesystem path allow-list -------------------------------------------
//
// Renderer-supplied paths flowing into fs.readTextFile / writeTextFile /
// writeFile are NOT trusted. The renderer can only read / write a path that
// the user *explicitly* picked through a native dialog in this session. We
// remember every path returned by dialog.showOpenDialog / showSaveDialog and
// require that subsequent FS calls hit a member of that set after canonical
// path.resolve().
//
// We also reject some classes of paths outright, even if the literal string
// somehow reached the allow-list:
//   * NUL byte (`\0`) — classic API-confusion truncation
//   * DOS-device prefixes (`\\?\`, `\\.\`) — bypass Win32 path normalization
//   * UNC (`\\server\share`) — only allowed when the dialog explicitly returned
//     such a path, never as a raw renderer string
//
// `path.resolve()` is the single canonicalization point so that both the
// allow-list entry and the call site are compared apples-to-apples. We do
// NOT call fs.realpath — symlink resolution is a separate concern and on
// Windows would mask a UNC vs DOS-device-vs-drive-letter difference we want
// to keep visible.

const allowedFsPaths = new Set<string>();

function rememberAllowedPath(p: string): void {
  if (typeof p !== 'string' || p.length === 0) return;
  allowedFsPaths.add(resolvePath(p));
}

function assertAllowedPath(input: unknown): string {
  if (typeof input !== 'string' || input.length === 0) {
    throw new Error('fs: path must be a non-empty string');
  }
  if (input.includes('\0')) {
    throw new Error('fs: path contains NUL byte (denied)');
  }
  // Reject Windows DOS-device prefixes regardless of allow-list membership.
  // `\\?\C:\foo` and `\\.\C:\foo` skip Win32 path normalization and would let
  // a renderer dodge the allow-list by re-spelling an allowed target.
  if (input.startsWith('\\\\?\\') || input.startsWith('\\\\.\\')) {
    throw new Error('fs: DOS-device path prefix not allowed (denied)');
  }
  const resolved = resolvePath(input);
  if (!allowedFsPaths.has(resolved)) {
    // Don't echo the path back to the renderer — it'd just confirm the probe.
    throw new Error('fs: path is not allow-listed (denied)');
  }
  return resolved;
}

// Test-only hooks. Production code never calls these. Tests reset the
// allow-list via vi.resetModules() between tests, but exposing this also
// lets future tests assert on / seed the allow-list directly.
export function __resetAllowedFsPathsForTests(): void {
  allowedFsPaths.clear();
}
export function __seedAllowedFsPathForTests(p: string): void {
  rememberAllowedPath(p);
}

// ---- IPC handlers ----------------------------------------------------------

/**
 * Pick the BrowserWindow to use as a native-dialog parent. Prefers whatever
 * has OS focus, but falls back to the module-level mainWindow. On Windows
 * specifically, getFocusedWindow() can momentarily return null during a
 * dropdown-close → menu-click transition; without a parent, the native file
 * dialog has no guaranteed z-order and can land hidden behind the app
 * window, making the toolbar appear broken.
 */
function dialogParent(): BrowserWindow | null {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed()) return focused;
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  return null;
}

function registerIpc(): void {
  // App ---------------------------------------------------------------------
  ipcMain.handle(IPC_CHANNELS.app.getName, () => app.getName());
  ipcMain.handle(IPC_CHANNELS.app.getVersion, () => app.getVersion());

  // Shell -------------------------------------------------------------------
  ipcMain.handle(IPC_CHANNELS.shell.open, async (_event, target: string) => {
    // shell.openExternal will happily launch ANY registered URI handler on
    // Windows — `ms-msdt:`, `search-ms:`, `file:///`, vendor protocols — so
    // we can't trust it to gate by protocol on its own. Parse the URL and
    // require an explicit-allow-list scheme. Reject everything else with a
    // logged warning instead of silently dropping it.
    if (typeof target !== 'string' || target.length === 0) {
      throw new Error('shell:open: target must be a non-empty string');
    }
    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch {
      throw new Error('shell:open: target is not a valid URL');
    }
    const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      console.warn(`shell:open: denied protocol "${parsed.protocol}"`);
      throw new Error(`shell:open: protocol "${parsed.protocol}" denied`);
    }
    await shell.openExternal(target);
  });

  // Dialog ------------------------------------------------------------------
  ipcMain.handle(
    IPC_CHANNELS.dialog.ask,
    async (_event, message: string, options: AskOptions = {}) => {
      const parent = dialogParent();
      const opts = {
        type: options.kind ?? ('question' as const),
        title: options.title ?? app.getName(),
        message,
        buttons: [options.okLabel ?? 'OK', options.cancelLabel ?? 'Cancel'],
        defaultId: 0,
        cancelId: 1,
      };
      const result = parent
        ? await dialog.showMessageBox(parent, opts)
        : await dialog.showMessageBox(opts);
      return result.response === 0;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.dialog.showOpenDialog,
    async (_event, options: OpenDialogOptions = {}) => {
      const parent = dialogParent();
      const properties: Array<'openFile' | 'openDirectory' | 'multiSelections'> = [];
      if (options.directory) properties.push('openDirectory');
      else properties.push('openFile');
      if (options.multiple) properties.push('multiSelections');
      const opts = {
        title: options.title,
        defaultPath: options.defaultPath,
        filters: options.filters,
        properties,
      };
      const result = parent
        ? await dialog.showOpenDialog(parent, opts)
        : await dialog.showOpenDialog(opts);
      if (result.canceled) return null;
      // Remember every picked path so subsequent fs.* IPC calls can reach
      // them. See "Filesystem path allow-list" above.
      for (const p of result.filePaths) rememberAllowedPath(p);
      return options.multiple ? result.filePaths : (result.filePaths[0] ?? null);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.dialog.showSaveDialog,
    async (_event, options: SaveDialogOptions = {}) => {
      const parent = dialogParent();
      const opts = {
        title: options.title,
        defaultPath: options.defaultPath,
        filters: options.filters,
      };
      const result = parent
        ? await dialog.showSaveDialog(parent, opts)
        : await dialog.showSaveDialog(opts);
      if (result.canceled || !result.filePath) return null;
      // Remember the picked save path so the renderer's follow-up
      // fs.writeTextFile / writeFile call clears the allow-list check.
      rememberAllowedPath(result.filePath);
      return result.filePath;
    }
  );

  // FS ----------------------------------------------------------------------
  // Each of these revalidates the renderer-supplied path against the
  // dialog-driven allow-list. See "Filesystem path allow-list" above.
  ipcMain.handle(IPC_CHANNELS.fs.readTextFile, async (_event, path: string) => {
    const safe = assertAllowedPath(path);
    return fs.readFile(safe, 'utf8');
  });
  ipcMain.handle(IPC_CHANNELS.fs.writeTextFile, async (_event, path: string, contents: string) => {
    const safe = assertAllowedPath(path);
    await fs.writeFile(safe, contents, 'utf8');
  });
  ipcMain.handle(IPC_CHANNELS.fs.writeFile, async (_event, path: string, contents: Uint8Array) => {
    const safe = assertAllowedPath(path);
    // contents arrives as a Uint8Array (transferable); wrap as Buffer for Node's writeFile.
    await fs.writeFile(safe, Buffer.from(contents));
  });

  // Store -------------------------------------------------------------------
  ipcMain.handle(IPC_CHANNELS.store.get, (_event, key: string) => settingsStore.get(key));
  ipcMain.handle(IPC_CHANNELS.store.set, (_event, key: string, value: unknown) => {
    settingsStore.set(key, value);
  });
  ipcMain.handle(IPC_CHANNELS.store.save, async () => {
    await settingsStore.flush();
  });
}

// ---- Lifecycle -------------------------------------------------------------

app.whenReady().then(async () => {
  registerIpc();
  await createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  // Ensure any pending writes hit disk before we quit.
  await settingsStore.flush();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
