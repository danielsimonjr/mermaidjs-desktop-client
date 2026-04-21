// Electron main process for MermaidJS Desktop.
// Responsibilities:
//   1. Create the BrowserWindow (with preload script, contextIsolation on, nodeIntegration off).
//   2. Restore saved window bounds on startup; persist on move/resize/close.
//   3. Register IPC handlers that mirror the Tauri plugin surface we replaced.
//
// The renderer never touches `app`, `dialog`, `fs`, or `shell` directly — every privileged
// operation goes through an IPC channel whose contract lives in ./types.ts.

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
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
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const targetUrl = new URL(url);
    const isDev = !app.isPackaged && targetUrl.origin === 'http://localhost:5173';
    if (!isDev) event.preventDefault();
  });
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

// ---- IPC handlers ----------------------------------------------------------

function registerIpc(): void {
  // App ---------------------------------------------------------------------
  ipcMain.handle(IPC_CHANNELS.app.getName, () => app.getName());
  ipcMain.handle(IPC_CHANNELS.app.getVersion, () => app.getVersion());

  // Shell -------------------------------------------------------------------
  ipcMain.handle(IPC_CHANNELS.shell.open, async (_event, target: string) => {
    // shell.openExternal is strict — only http/https/mailto/file by default.
    await shell.openExternal(target);
  });

  // Dialog ------------------------------------------------------------------
  ipcMain.handle(
    IPC_CHANNELS.dialog.ask,
    async (_event, message: string, options: AskOptions = {}) => {
      const parent = BrowserWindow.getFocusedWindow();
      const result = await dialog.showMessageBox(parent ?? undefined!, {
        type: options.kind ?? 'question',
        title: options.title ?? app.getName(),
        message,
        buttons: [options.okLabel ?? 'OK', options.cancelLabel ?? 'Cancel'],
        defaultId: 0,
        cancelId: 1,
      });
      return result.response === 0;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.dialog.showOpenDialog,
    async (_event, options: OpenDialogOptions = {}) => {
      const parent = BrowserWindow.getFocusedWindow();
      const properties: Array<'openFile' | 'openDirectory' | 'multiSelections'> = [];
      if (options.directory) properties.push('openDirectory');
      else properties.push('openFile');
      if (options.multiple) properties.push('multiSelections');
      const result = await dialog.showOpenDialog(parent ?? undefined!, {
        title: options.title,
        defaultPath: options.defaultPath,
        filters: options.filters,
        properties,
      });
      if (result.canceled) return null;
      return options.multiple ? result.filePaths : (result.filePaths[0] ?? null);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.dialog.showSaveDialog,
    async (_event, options: SaveDialogOptions = {}) => {
      const parent = BrowserWindow.getFocusedWindow();
      const result = await dialog.showSaveDialog(parent ?? undefined!, {
        title: options.title,
        defaultPath: options.defaultPath,
        filters: options.filters,
      });
      return result.canceled ? null : (result.filePath ?? null);
    }
  );

  // FS ----------------------------------------------------------------------
  ipcMain.handle(IPC_CHANNELS.fs.readTextFile, async (_event, path: string) => {
    return fs.readFile(path, 'utf8');
  });
  ipcMain.handle(IPC_CHANNELS.fs.writeTextFile, async (_event, path: string, contents: string) => {
    await fs.writeFile(path, contents, 'utf8');
  });
  ipcMain.handle(IPC_CHANNELS.fs.writeFile, async (_event, path: string, contents: Uint8Array) => {
    // contents arrives as a Uint8Array (transferable); wrap as Buffer for Node's writeFile.
    await fs.writeFile(path, Buffer.from(contents));
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
