import type { EditorView } from 'codemirror';

export interface OpenDiagramContext {
  editor: EditorView;
  schedulePreviewRender: (doc: string) => void;
  onPathChange: (path: string | null) => void;
  onOpen?: (doc: string, path: string) => void;
  shouldReplace?: () => boolean | Promise<boolean>;
}

/**
 * Show the OS open dialog, load the chosen file, and push it into the editor.
 * Returns the path that was opened (null = user cancelled or error).
 */
export async function pickAndOpenDiagram(ctx: OpenDiagramContext): Promise<string | null> {
  try {
    const selected = await window.api.dialog.showOpenDialog({
      filters: [
        { name: 'Mermaid Diagram', extensions: ['mmd', 'mermaid', 'md'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (!selected) return null;
    const path = Array.isArray(selected) ? selected[0] : selected;
    if (!path) return null;
    return await loadPath(ctx, path);
  } catch (error) {
    console.error('Failed to open diagram', error);
    return null;
  }
}

/**
 * Load a known file path into the editor — used by "Open recent" and
 * drag-drop flows. Respects shouldReplace() like the picker path.
 */
export async function openPath(ctx: OpenDiagramContext, path: string): Promise<string | null> {
  try {
    return await loadPath(ctx, path);
  } catch (error) {
    console.error('Failed to open recent file', error);
    return null;
  }
}

async function loadPath(ctx: OpenDiagramContext, path: string): Promise<string | null> {
  const { editor, schedulePreviewRender, onPathChange, onOpen, shouldReplace } = ctx;
  if (typeof shouldReplace === 'function') {
    const allow = await Promise.resolve(shouldReplace());
    if (!allow) return null;
  }
  const fileContents = await window.api.fs.readTextFile(path);
  editor.dispatch({
    changes: { from: 0, to: editor.state.doc.length, insert: fileContents },
  });
  schedulePreviewRender(fileContents);
  onPathChange(path);
  onOpen?.(fileContents, path);
  return path;
}

/**
 * Backward-compatible button wiring.  Click -> pickAndOpenDiagram().
 * Kept so the existing test suite doesn't break; the palette / recent-files
 * flows call pickAndOpenDiagram / openPath directly.
 */
interface OpenDiagramOptions extends OpenDiagramContext {
  button: HTMLButtonElement | null;
}

export function setupOpenDiagramAction(options: OpenDiagramOptions): void {
  if (!options.button) return;
  options.button.addEventListener('click', () => {
    void pickAndOpenDiagram(options);
  });
}
