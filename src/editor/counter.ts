// Character / line / column counter that updates as the editor state changes.
// We return the Extension to be installed on the EditorView; the update listener
// writes into the supplied DOM element on every transaction.

import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

export function createCounterExtension(target: HTMLElement | null): Extension {
  if (!target) return [];

  const renderFrom = (view: EditorView): void => {
    const state = view.state;
    const doc = state.doc;
    const selection = state.selection.main;
    const line = doc.lineAt(selection.head);
    const col = selection.head - line.from + 1;
    const chars = doc.length;
    target.textContent = `Ln ${line.number}, Col ${col} · ${chars} chars`;
  };

  return [
    EditorView.updateListener.of((update) => {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        renderFrom(update.view);
      }
    }),
    // On install, run once so the counter shows real data immediately.
    /* v8 ignore start — happy-dom doesn't fire CodeMirror's focus event reliably. */
    EditorView.domEventHandlers({
      focus: (_event, view) => {
        renderFrom(view);
        return false;
      },
    }),
    /* v8 ignore stop */
  ];
}
