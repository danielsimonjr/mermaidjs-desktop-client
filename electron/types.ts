// Shared types between main process, preload, and renderer.
// Mirror of the Tauri plugin surface that the app used (keeps renderer diff small).

export interface AskOptions {
  /** Human-readable title for the message box. */
  title?: string;
  /** "info" | "warning" | "error" | "question" (mapped to Electron dialog types). */
  kind?: 'info' | 'warning' | 'error';
  /** Label for the confirm button. */
  okLabel?: string;
  /** Label for the cancel button. */
  cancelLabel?: string;
}

export interface DialogFilter {
  name: string;
  extensions: string[];
}

export interface OpenDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: DialogFilter[];
  multiple?: boolean;
  directory?: boolean;
}

export interface SaveDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: DialogFilter[];
}

export interface WindowSize {
  width: number;
  height: number;
}

export interface WindowPosition {
  x: number;
  y: number;
}

/** Shape exposed to the renderer via `window.api`. Keep it flat to minimize diff against old Tauri call sites. */
export interface ElectronApi {
  app: {
    getName(): Promise<string>;
    getVersion(): Promise<string>;
  };
  shell: {
    /** Open a URL or path in the OS default handler (external browser etc.). */
    open(target: string): Promise<void>;
  };
  dialog: {
    /** Modal confirmation — returns true when the user picked OK. */
    ask(message: string, options?: AskOptions): Promise<boolean>;
    /** File picker — returns selected path or null if cancelled. Multiple=true returns string[]. */
    showOpenDialog(options?: OpenDialogOptions): Promise<string | string[] | null>;
    showSaveDialog(options?: SaveDialogOptions): Promise<string | null>;
  };
  fs: {
    readTextFile(path: string): Promise<string>;
    writeTextFile(path: string, contents: string): Promise<void>;
    /** Write raw bytes (e.g., PNG). Accepts a Uint8Array transferred over IPC as a Buffer. */
    writeFile(path: string, contents: Uint8Array): Promise<void>;
  };
  store: {
    get<T = unknown>(key: string): Promise<T | null>;
    set(key: string, value: unknown): Promise<void>;
    /** Force-flush pending writes to disk. No-op if nothing pending. */
    save(): Promise<void>;
  };
}

/** IPC channel names (centralized so main and preload never drift). */
export const IPC_CHANNELS = {
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
