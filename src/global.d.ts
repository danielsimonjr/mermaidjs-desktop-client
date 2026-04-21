// Renderer-side declaration of the preload bridge.
// The runtime shape is defined in electron/types.ts and exposed in electron/preload.ts.

import type { ElectronApi } from '../electron/types';

declare global {
  interface Window {
    api: ElectronApi;
  }
}

export {};
