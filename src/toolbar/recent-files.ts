// Recent files — persisted list of the last N opened/saved file paths.
// Stored via window.api.store under the key below; kept small to avoid
// slowing down startup.

const STORE_KEY = 'recentFiles';
const MAX_ENTRIES = 10;

export interface RecentFilesController {
  /** Read the current list (most recent first). */
  read(): Promise<string[]>;
  /** Add a path to the front (deduplicated, capped, persisted). */
  push(path: string): Promise<string[]>;
  /** Clear all entries. */
  clear(): Promise<void>;
  /** Remove a specific path (e.g. user deleted it on disk). */
  remove(path: string): Promise<string[]>;
}

export function createRecentFiles(): RecentFilesController {
  async function read(): Promise<string[]> {
    try {
      const raw = await window.api.store.get<unknown>(STORE_KEY);
      if (!Array.isArray(raw)) return [];
      return raw.filter((p): p is string => typeof p === 'string' && p.length > 0);
    } catch (err) {
      console.warn('recent-files: read failed', err);
      return [];
    }
  }

  async function write(list: string[]): Promise<void> {
    try {
      await window.api.store.set(STORE_KEY, list.slice(0, MAX_ENTRIES));
    } catch (err) {
      console.warn('recent-files: write failed', err);
    }
  }

  async function push(path: string): Promise<string[]> {
    if (!path) return read();
    const existing = await read();
    const deduped = [path, ...existing.filter((p) => p !== path)];
    const capped = deduped.slice(0, MAX_ENTRIES);
    await write(capped);
    return capped;
  }

  async function clear(): Promise<void> {
    await write([]);
  }

  async function remove(path: string): Promise<string[]> {
    const existing = await read();
    const next = existing.filter((p) => p !== path);
    await write(next);
    return next;
  }

  return { read, push, clear, remove };
}

/** Extract the filename portion of a path for display. */
export function basenameOf(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const i = normalized.lastIndexOf('/');
  return i >= 0 ? normalized.slice(i + 1) : normalized;
}
