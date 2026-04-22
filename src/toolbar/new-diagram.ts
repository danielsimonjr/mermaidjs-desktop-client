import type { EditorView } from 'codemirror';

import { showToast } from '../ui/toast';

interface NewDiagramOptions {
  editor: EditorView;
  schedulePreviewRender: (doc: string) => void;
  button: HTMLButtonElement | null;
  defaultSnippet: string;
  onPathChange: (path: string | null) => void;
  onNew?: (doc: string) => void;
  shouldReplace?: () => boolean | Promise<boolean>;
}

export function setupNewDiagramAction(options: NewDiagramOptions): void {
  const {
    editor,
    schedulePreviewRender,
    button,
    defaultSnippet,
    onPathChange,
    onNew,
    shouldReplace,
  } = options;
  if (!button) return;

  button.addEventListener('click', async () => {
    if (typeof shouldReplace === 'function') {
      const allow = await Promise.resolve(shouldReplace());
      if (!allow) {
        return;
      }
    }
    // Reset to the default snippet. When the current doc already matches the
    // default (e.g. the user just launched and hasn't edited), the dispatch is
    // content-identical — no editor/preview change to look at. Without visible
    // feedback the click looks like a no-op and users report "New doesn't work",
    // so we always reset the cursor + scroll and surface a toast regardless.
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: defaultSnippet },
      selection: { anchor: 0, head: 0 },
      scrollIntoView: true,
    });
    editor.focus();
    schedulePreviewRender(defaultSnippet);
    onPathChange(null);
    onNew?.(defaultSnippet);
    showToast('New diagram created', 'success');
  });
}
