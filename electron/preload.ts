// Preload bridge: exposes the ElectronApi to the renderer under `window.api`.
// Runs in an isolated world with Node access, but nothing Node-y leaks into the
// renderer globals — only the explicit contract from ./types.ts.

import { contextBridge, ipcRenderer } from 'electron';

import {
  IPC_CHANNELS,
  type AskOptions,
  type ElectronApi,
  type OpenDialogOptions,
  type SaveDialogOptions,
} from './types';

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
