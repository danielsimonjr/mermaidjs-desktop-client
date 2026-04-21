import { describe, it, expect, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { setupSaveDiagramAction } from '../../src/toolbar/save-diagram';

function makeEditor(doc = 'hello') {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return new EditorView({
    parent: host,
    state: EditorState.create({ doc, extensions: [] }),
  });
}

describe('setupSaveDiagramAction', () => {
  it('is a no-op when button is null', () => {
    const editor = makeEditor();
    expect(() =>
      setupSaveDiagramAction({
        editor,
        button: null,
        getPath: () => null,
        onPathChange: () => {},
      })
    ).not.toThrow();
  });

  it('saves to existing path without prompting', async () => {
    const editor = makeEditor('hi');
    const button = document.createElement('button');
    setupSaveDiagramAction({
      editor,
      button,
      getPath: () => '/existing.mmd',
      onPathChange: vi.fn(),
      onSave: vi.fn(),
    });

    button.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(window.api.dialog.showSaveDialog).not.toHaveBeenCalled();
    expect(window.api.fs.writeTextFile).toHaveBeenCalledWith('/existing.mmd', 'hi');
  });

  it('prompts for a path when none exists yet', async () => {
    const editor = makeEditor('new');
    const button = document.createElement('button');
    vi.mocked(window.api.dialog.showSaveDialog).mockResolvedValue('/picked.mmd');
    const onPathChange = vi.fn();
    const onSave = vi.fn();
    setupSaveDiagramAction({
      editor,
      button,
      getPath: () => null,
      onPathChange,
      onSave,
    });

    button.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(window.api.fs.writeTextFile).toHaveBeenCalledWith('/picked.mmd', 'new');
    expect(onPathChange).toHaveBeenCalledWith('/picked.mmd');
    expect(onSave).toHaveBeenCalledWith('new', '/picked.mmd');
  });

  it('aborts when user cancels the save dialog', async () => {
    const editor = makeEditor('x');
    const button = document.createElement('button');
    vi.mocked(window.api.dialog.showSaveDialog).mockResolvedValue(null);
    setupSaveDiagramAction({
      editor,
      button,
      getPath: () => null,
      onPathChange: vi.fn(),
    });
    button.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(window.api.fs.writeTextFile).not.toHaveBeenCalled();
  });

  it('logs on write failure', async () => {
    const editor = makeEditor('x');
    const button = document.createElement('button');
    vi.mocked(window.api.fs.writeTextFile).mockRejectedValue(new Error('disk full'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    setupSaveDiagramAction({
      editor,
      button,
      getPath: () => '/out.mmd',
      onPathChange: vi.fn(),
    });
    button.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
