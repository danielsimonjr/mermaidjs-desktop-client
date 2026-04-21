import { describe, it, expect, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import {
  openPath,
  pickAndOpenDiagram,
  setupOpenDiagramAction,
} from '../../src/toolbar/open-diagram';

function makeEditor(doc = '') {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return new EditorView({
    parent: host,
    state: EditorState.create({ doc, extensions: [] }),
  });
}

describe('setupOpenDiagramAction', () => {
  it('is a no-op when button is null', () => {
    const editor = makeEditor();
    expect(() =>
      setupOpenDiagramAction({
        editor,
        schedulePreviewRender: () => {},
        button: null,
        onPathChange: () => {},
      })
    ).not.toThrow();
  });

  it('does nothing if user cancels the open dialog', async () => {
    const editor = makeEditor('keep');
    const button = document.createElement('button');
    vi.mocked(window.api.dialog.showOpenDialog).mockResolvedValue(null);
    const schedule = vi.fn();
    setupOpenDiagramAction({
      editor,
      schedulePreviewRender: schedule,
      button,
      onPathChange: () => {},
    });

    button.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(editor.state.doc.toString()).toBe('keep');
    expect(schedule).not.toHaveBeenCalled();
  });

  it('aborts when shouldReplace resolves false', async () => {
    const editor = makeEditor('keep');
    const button = document.createElement('button');
    vi.mocked(window.api.dialog.showOpenDialog).mockResolvedValue('/path/to/file.mmd');
    vi.mocked(window.api.fs.readTextFile).mockResolvedValue('fresh');
    const shouldReplace = vi.fn(async () => false);

    setupOpenDiagramAction({
      editor,
      schedulePreviewRender: vi.fn(),
      button,
      onPathChange: vi.fn(),
      shouldReplace,
    });

    button.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(shouldReplace).toHaveBeenCalled();
    expect(window.api.fs.readTextFile).not.toHaveBeenCalled();
    expect(editor.state.doc.toString()).toBe('keep');
  });

  it('loads file contents into the editor and fires callbacks', async () => {
    const editor = makeEditor('');
    const button = document.createElement('button');
    vi.mocked(window.api.dialog.showOpenDialog).mockResolvedValue('/path/to/file.mmd');
    vi.mocked(window.api.fs.readTextFile).mockResolvedValue('loaded content');
    const schedule = vi.fn();
    const onPathChange = vi.fn();
    const onOpen = vi.fn();

    setupOpenDiagramAction({
      editor,
      schedulePreviewRender: schedule,
      button,
      onPathChange,
      onOpen,
    });

    button.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(editor.state.doc.toString()).toBe('loaded content');
    expect(schedule).toHaveBeenCalledWith('loaded content');
    expect(onPathChange).toHaveBeenCalledWith('/path/to/file.mmd');
    expect(onOpen).toHaveBeenCalledWith('loaded content', '/path/to/file.mmd');
  });

  it('handles array return (multi-select) by using the first path', async () => {
    const editor = makeEditor('');
    const button = document.createElement('button');
    vi.mocked(window.api.dialog.showOpenDialog).mockResolvedValue(['/a.mmd', '/b.mmd']);
    vi.mocked(window.api.fs.readTextFile).mockResolvedValue('first');

    setupOpenDiagramAction({
      editor,
      schedulePreviewRender: vi.fn(),
      button,
      onPathChange: vi.fn(),
    });

    button.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(window.api.fs.readTextFile).toHaveBeenCalledWith('/a.mmd');
  });

  it('swallows errors and logs them', async () => {
    const editor = makeEditor('keep');
    const button = document.createElement('button');
    vi.mocked(window.api.dialog.showOpenDialog).mockRejectedValue(new Error('boom'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    setupOpenDiagramAction({
      editor,
      schedulePreviewRender: vi.fn(),
      button,
      onPathChange: vi.fn(),
    });

    button.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('openPath loads a known file directly without showing the picker', async () => {
    const editor = makeEditor();
    vi.mocked(window.api.fs.readTextFile).mockResolvedValue('from recent');
    const schedule = vi.fn();
    const onOpen = vi.fn();
    const onPathChange = vi.fn();
    const path = await openPath(
      { editor, schedulePreviewRender: schedule, onPathChange, onOpen },
      '/recent.mmd'
    );
    expect(path).toBe('/recent.mmd');
    expect(window.api.dialog.showOpenDialog).not.toHaveBeenCalled();
    expect(editor.state.doc.toString()).toBe('from recent');
    expect(onOpen).toHaveBeenCalledWith('from recent', '/recent.mmd');
  });

  it('openPath swallows read errors + logs', async () => {
    const editor = makeEditor();
    vi.mocked(window.api.fs.readTextFile).mockRejectedValueOnce(new Error('perm denied'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await openPath(
      { editor, schedulePreviewRender: vi.fn(), onPathChange: vi.fn() },
      '/x.mmd'
    );
    expect(result).toBeNull();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('openPath respects shouldReplace() === false', async () => {
    const editor = makeEditor('keep');
    const shouldReplace = vi.fn(async () => false);
    const result = await openPath(
      {
        editor,
        schedulePreviewRender: vi.fn(),
        onPathChange: vi.fn(),
        shouldReplace,
      },
      '/x.mmd'
    );
    expect(result).toBeNull();
    expect(window.api.fs.readTextFile).not.toHaveBeenCalled();
    expect(editor.state.doc.toString()).toBe('keep');
  });

  it('pickAndOpenDiagram return value matches the opened path', async () => {
    const editor = makeEditor();
    vi.mocked(window.api.dialog.showOpenDialog).mockResolvedValueOnce('/picked.mmd');
    vi.mocked(window.api.fs.readTextFile).mockResolvedValueOnce('content');
    const result = await pickAndOpenDiagram({
      editor,
      schedulePreviewRender: vi.fn(),
      onPathChange: vi.fn(),
    });
    expect(result).toBe('/picked.mmd');
  });

  it('pickAndOpenDiagram returns null on cancel', async () => {
    const editor = makeEditor();
    vi.mocked(window.api.dialog.showOpenDialog).mockResolvedValueOnce(null);
    const result = await pickAndOpenDiagram({
      editor,
      schedulePreviewRender: vi.fn(),
      onPathChange: vi.fn(),
    });
    expect(result).toBeNull();
  });

  it('ignores empty string path in array (filePaths[0] === "")', async () => {
    const editor = makeEditor('keep');
    const button = document.createElement('button');
    vi.mocked(window.api.dialog.showOpenDialog).mockResolvedValue(['']);
    const schedule = vi.fn();
    setupOpenDiagramAction({
      editor,
      schedulePreviewRender: schedule,
      button,
      onPathChange: vi.fn(),
    });
    button.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(schedule).not.toHaveBeenCalled();
  });
});
