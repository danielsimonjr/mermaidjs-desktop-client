// Preload bridge: exposes the ElectronApi to the renderer under `window.api`.
// Runs in an isolated world with Node access, but nothing Node-y leaks into the
// renderer globals — only the explicit contract from ./types.ts.
//
// IMPORTANT: this preload is loaded under sandbox: true (see electron/main.ts).
// Electron's sandboxed preloads can only `require()` the electron module and
// a handful of built-ins — NOT sibling JS files. Any non-electron import would
// fail at load time with "module not found", the preload would abort before
// calling contextBridge.exposeInMainWorld, and window.api would be undefined
// in the renderer. That's why every runtime constant used here (currently
// IPC_CHANNELS) is inlined rather than imported from ./types.
//
// Types are safe to pull from ./types via `import type` — those are erased at
// compile time and produce no runtime require(). The runtime copy of
// IPC_CHANNELS below is kept in lockstep with types.ts by
// tests/electron/preload.test.ts, which asserts the two are deep-equal.

import { contextBridge, ipcRenderer } from 'electron';

import type {
  AskOptions,
  ElectronApi,
  OpenDialogOptions,
  SaveDialogOptions,
} from './types';

// Inlined copy of IPC_CHANNELS from ./types.ts (see header comment).
// Keep this in sync with the export there. The preload-sync test guards against drift.
const IPC_CHANNELS = {
  app: {
    getName: 'app:getName',
    getVersion: 'app:getVersion',
  },
  shell: {
    open: 'shell:open',
  },
  dialog: {
    ask: 'dialog:ask',
    showOpenDialog: 'dialog:showOpenDialog',
    showSaveDialog: 'dialog:showSaveDialog',
  },
  fs: {
    readTextFile: 'fs:readTextFile',
    writeTextFile: 'fs:writeTextFile',
    writeFile: 'fs:writeFile',
  },
  store: {
    get: 'store:get',
    set: 'store:set',
    save: 'store:save',
  },
} as const;

const api: ElectronApi = {
  app: {
    getName: () => ipcRenderer.invoke(IPC_CHANNELS.app.getName),
    getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.app.getVersion),
  },
  shell: {
    open: (target: string) => ipcRenderer.invoke(IPC_CHANNELS.shell.open, target),
  },
  dialog: {
    ask: (message: string, options?: AskOptions) =>
      ipcRenderer.invoke(IPC_CHANNELS.dialog.ask, message, options),
    showOpenDialog: (options?: OpenDialogOptions) =>
      ipcRenderer.invoke(IPC_CHANNELS.dialog.showOpenDialog, options),
    showSaveDialog: (options?: SaveDialogOptions) =>
      ipcRenderer.invoke(IPC_CHANNELS.dialog.showSaveDialog, options),
  },
  fs: {
    readTextFile: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.fs.readTextFile, path),
    writeTextFile: (path: string, contents: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.fs.writeTextFile, path, contents),
    writeFile: (path: string, contents: Uint8Array) =>
      ipcRenderer.invoke(IPC_CHANNELS.fs.writeFile, path, contents),
  },
  store: {
    get: (key: string) => ipcRenderer.invoke(IPC_CHANNELS.store.get, key),
    set: (key: string, value: unknown) => ipcRenderer.invoke(IPC_CHANNELS.store.set, key, value),
    save: () => ipcRenderer.invoke(IPC_CHANNELS.store.save),
  },
};

contextBridge.exposeInMainWorld('api', api);
