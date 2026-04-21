// Mermaid theme picker — re-initializes mermaid with the chosen theme and
// triggers a preview re-render. Persisted via window.api.store so the
// choice survives restarts.

import { loadMermaid } from './mermaid-loader';

export type MermaidTheme = 'default' | 'dark' | 'forest' | 'neutral';

const STORE_KEY = 'mermaidTheme';
const VALID_THEMES: MermaidTheme[] = ['default', 'dark', 'forest', 'neutral'];

export interface MermaidThemeController {
  get(): MermaidTheme;
  /** Change the theme, persist, and invoke the rerender callback. */
  set(theme: MermaidTheme): Promise<void>;
  /** Load the stored theme (if any) and apply it. Returns the applied theme. */
  initialize(): Promise<MermaidTheme>;
}

export function createMermaidTheme(
  onChange?: (theme: MermaidTheme) => void,
  defaultTheme: MermaidTheme = 'dark'
): MermaidThemeController {
  let current: MermaidTheme = defaultTheme;

  async function applyToMermaid(theme: MermaidTheme): Promise<void> {
    const mermaid = await loadMermaid();
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme,
    });
  }

  async function initialize(): Promise<MermaidTheme> {
    try {
      const raw = await window.api.store.get<unknown>(STORE_KEY);
      if (typeof raw === 'string' && (VALID_THEMES as readonly string[]).includes(raw)) {
        current = raw as MermaidTheme;
      }
    } catch (err) {
      console.warn('mermaid-theme: read failed', err);
    }
    await applyToMermaid(current);
    return current;
  }

  async function set(theme: MermaidTheme): Promise<void> {
    if (!(VALID_THEMES as readonly string[]).includes(theme)) return;
    current = theme;
    await applyToMermaid(theme);
    try {
      await window.api.store.set(STORE_KEY, theme);
    } catch (err) {
      console.warn('mermaid-theme: write failed', err);
    }
    onChange?.(theme);
  }

  function get(): MermaidTheme {
    return current;
  }

  return { get, set, initialize };
}
