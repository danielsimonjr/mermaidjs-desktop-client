import type { EditorView } from 'codemirror';

export interface SaveDiagramContext {
  editor: EditorView;
  getPath: () => string | null;
  onPathChange: (path: string | null) => void;
  onSave?: (doc: string, path: string) => void;
}

/**
 * Save the current editor buffer. If no current path exists, prompts the
 * user for one. Returns the path written to (null = user cancelled / error).
 */
export async function saveDiagram(ctx: SaveDiagramContext): Promise<string | null> {
  const { editor, getPath, onPathChange, onSave } = ctx;
  const documentContent = editor.state.doc.toString();
  let targetPath = getPath();

  try {
    if (!targetPath) {
      const picked = await window.api.dialog.showSaveDialog({
        defaultPath: 'diagram.mmd',
        filters: [
          { name: 'Mermaid Diagram', extensions: ['mmd', 'mermaid', 'md'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (typeof picked !== 'string') return null;
      targetPath = picked;
    }
    await window.api.fs.writeTextFile(targetPath, documentContent);
    onPathChange(targetPath);
    onSave?.(documentContent, targetPath);
    return targetPath;
  } catch (error) {
    console.error('Failed to save diagram', error);
    return null;
  }
}

interface SaveDiagramOptions extends SaveDiagramContext {
  button: HTMLButtonElement | null;
}

/** Backward-compatible button wiring. */
export function setupSaveDiagramAction(options: SaveDiagramOptions): void {
  if (!options.button) return;
  options.button.addEventListener('click', () => {
    void saveDiagram(options);
  });
}
