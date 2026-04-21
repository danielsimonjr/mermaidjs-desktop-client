// Global test setup — runs once per test file before the tests inside it.
//
// Goals:
//   1. Shim browser APIs that happy-dom doesn't ship (ResizeObserver, etc.).
//      CodeMirror queries ResizeObserver on construction, so without this every
//      EditorView() call throws.
//   2. Install a default `window.api` mock so renderer code under test can call
//      window.api.* without each test rewiring it. Individual tests override
//      specific methods with vi.mocked() when they need to assert on calls.

import { vi, beforeEach } from 'vitest';

// ---- ResizeObserver polyfill ----
if (!(globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver) {
  class RO {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
}

// ---- matchMedia shim (CodeMirror touches it for dark-mode detection) ----
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// ---- Default window.api mock ----
// Every method is a vi.fn so tests can assert on calls and tweak return values.
function makeApiMock() {
  return {
    app: {
      getName: vi.fn(async () => 'MermaidJS Desktop'),
      getVersion: vi.fn(async () => '2.3.1'),
    },
    shell: {
      open: vi.fn(async () => {}),
    },
    dialog: {
      ask: vi.fn(async () => true),
      showOpenDialog: vi.fn(async () => null),
      showSaveDialog: vi.fn(async () => null),
    },
    fs: {
      readTextFile: vi.fn(async () => ''),
      writeTextFile: vi.fn(async () => {}),
      writeFile: vi.fn(async () => {}),
    },
    store: {
      get: vi.fn(async () => null),
      set: vi.fn(async () => {}),
      save: vi.fn(async () => {}),
    },
  };
}

// Reset the mock before every test so one test's vi.mocked overrides don't leak.
// window.api's type is already declared via src/global.d.ts as ElectronApi;
// we don't re-declare here (would conflict), just cast at assignment.
beforeEach(() => {
  (window as unknown as { api: unknown }).api = makeApiMock();
});
