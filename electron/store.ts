// Hand-rolled JSON store (decision 3B: no electron-store dependency).
// Persists to `app.getPath('userData')/settings.json` with atomic writes.
// Writes are debounced so a resize drag or rapid key presses don't hammer the disk,
// but we always flush on app quit so nothing is lost on clean exit.

import { app } from 'electron';
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';

const SETTINGS_FILENAME = 'settings.json';
const FLUSH_DELAY_MS = 400;

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

class SettingsStore {
  private data: Record<string, JsonValue> = {};
  private loaded = false;
  private pendingFlush: NodeJS.Timeout | null = null;
  private writeInFlight: Promise<void> = Promise.resolve();

  private get filePath(): string {
    return join(app.getPath('userData'), SETTINGS_FILENAME);
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        this.data = parsed;
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        console.warn('[settings] failed to load, starting empty:', err);
      }
    }
    this.loaded = true;
  }

  get<T = unknown>(key: string): T | null {
    return (this.data[key] as T | undefined) ?? null;
  }

  set(key: string, value: unknown): void {
    this.data[key] = value as JsonValue;
    this.scheduleFlush();
  }

  /** Debounced write-through. Resets the timer on every call. */
  private scheduleFlush(): void {
    if (this.pendingFlush) clearTimeout(this.pendingFlush);
    this.pendingFlush = setTimeout(() => {
      this.pendingFlush = null;
      void this.flush();
    }, FLUSH_DELAY_MS);
  }

  /** Force an immediate write, serialized against any in-flight write. */
  async flush(): Promise<void> {
    if (this.pendingFlush) {
      clearTimeout(this.pendingFlush);
      this.pendingFlush = null;
    }
    // Serialize writes so we never interleave two writeFile calls on the same path.
    this.writeInFlight = this.writeInFlight.then(() => this.atomicWrite());
    return this.writeInFlight;
  }

  /** Atomic write: write to tmp, fsync, rename. Prevents half-written file on crash. */
  private async atomicWrite(): Promise<void> {
    const target = this.filePath;
    const tmp = `${target}.${process.pid}.tmp`;
    const serialized = JSON.stringify(this.data, null, 2);
    try {
      await fs.mkdir(dirname(target), { recursive: true });
      await fs.writeFile(tmp, serialized, 'utf8');
      await fs.rename(tmp, target);
    } catch (err) {
      console.warn('[settings] write failed:', err);
      // Best-effort cleanup of stale tmp.
      try { await fs.unlink(tmp); } catch { /* ignore */ }
    }
  }
}

export const settingsStore = new SettingsStore();
