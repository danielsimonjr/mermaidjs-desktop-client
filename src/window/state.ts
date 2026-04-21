// Window & editor state persistence for the renderer.
//
// Note: window bounds (width/height/x/y/maximized) are persisted entirely in the
// Electron main process — see electron/main.ts. This module only deals with the
// small bits of state that the renderer itself controls (currently: editor zoom).
//
// The `setupWindowPersistence` export is retained as a no-op so the existing
// call site in src/main.ts doesn't need to know the responsibility moved.

const EDITOR_ZOOM_KEY = 'editorZoom';

/** Opaque handle — used only so callers can keep type-safe contracts, no real state carried. */
export interface SettingsStoreHandle {
  readonly ready: true;
}

export async function loadSettingsStore(): Promise<SettingsStoreHandle | null> {
  // The store is opened eagerly in main.ts; the renderer just talks to it via IPC.
  // Return a handle purely so downstream code can guard on "store available" the
  // same way it did with the Tauri Store object.
  return { ready: true };
}

/**
 * No-op: window bounds are owned by the main process. Kept so src/main.ts doesn't
 * need to change call-site shape and so we could revive renderer-side tracking
 * later if something non-bounds (e.g. sidebar width) needs persistence.
 */
export async function setupWindowPersistence(
  _store: SettingsStoreHandle,
  _unused: unknown,
  _persistDelay: number
): Promise<void> {
  // intentionally empty — see electron/main.ts
}

export async function loadEditorZoom(_store: SettingsStoreHandle): Promise<number | null> {
  try {
    const value = await window.api.store.get<number>(EDITOR_ZOOM_KEY);
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  } catch (error) {
    console.warn('Loading editor zoom failed', error);
    return null;
  }
}

export async function saveEditorZoom(_store: SettingsStoreHandle, level: number): Promise<void> {
  try {
    await window.api.store.set(EDITOR_ZOOM_KEY, level);
    // Let the main-side debouncer handle flushing; no explicit save() needed.
  } catch (error) {
    console.warn('Saving editor zoom failed', error);
  }
}
