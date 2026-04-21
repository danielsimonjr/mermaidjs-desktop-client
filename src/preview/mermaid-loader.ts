// Dynamic-import shim for mermaid.
//
// Mermaid is ~1 MB parsed and is only needed once the user actually wants a
// diagram (preview render, theme change, export). Deferring the import keeps
// it out of the initial renderer bundle, so the window can paint sooner.
//
// The singleton promise means concurrent callers share one import; subsequent
// callers get the already-resolved instance instantly.

type MermaidModule = typeof import('mermaid').default;

let mermaidPromise: Promise<MermaidModule> | null = null;

export function loadMermaid(): Promise<MermaidModule> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => m.default);
  }
  return mermaidPromise;
}
