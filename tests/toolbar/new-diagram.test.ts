import { describe, it, expect, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { setupNewDiagramAction } from '../../src/toolbar/new-diagram';

function makeEditor(doc = 'old content') {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const view = new EditorView({
    parent: host,
    state: EditorState.create({ doc, extensions: [] }),
  });
  return view;
}

describe('setupNewDiagramAction', () => {
  it('is a no-op when button is null', () => {
    const editor = makeEditor();
    expect(() =>
      setupNewDiagramAction({
        editor,
        schedulePreviewRender: () => {},
        button: null,
        defaultSnippet: 'SNIPPET',
        onPathChange: () => {},
      })
    ).not.toThrow();
  });

  it('replaces editor content + clears path + fires callbacks on click', async () => {
    const editor = makeEditor('old');
    const button = document.createElement('button');
    const schedule = vi.fn();
    const onPathChange = vi.fn();
    const onNew = vi.fn();

    setupNewDiagramAction({
      editor,
      schedulePreviewRender: schedule,
      button,
      defaultSnippet: 'NEW',
      onPathChange,
      onNew,
    });

    button.click();
    await Promise.resolve(); // let async handler settle
    expect(editor.state.doc.toString()).toBe('NEW');
    expect(schedule).toHaveBeenCalledWith('NEW');
    expect(onPathChange).toHaveBeenCalledWith(null);
    expect(onNew).toHaveBeenCalledWith('NEW');
  });

  it('aborts when shouldReplace() returns false', async () => {
    const editor = makeEditor('keep me');
    const button = document.createElement('button');
    const shouldReplace = vi.fn(async () => false);
    const schedule = vi.fn();

    setupNewDiagramAction({
      editor,
      schedulePreviewRender: schedule,
      button,
      defaultSnippet: 'NEW',
      onPathChange: () => {},
      shouldReplace,
    });

    button.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(shouldReplace).toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
    expect(editor.state.doc.toString()).toBe('keep me');
  });

  it('proceeds when shouldReplace() returns true (sync or async)', async () => {
    const editor = makeEditor('old');
    const button = document.createElement('button');
    setupNewDiagramAction({
      editor,
      schedulePreviewRender: () => {},
      button,
      defaultSnippet: 'NEW',
      onPathChange: () => {},
      shouldReplace: () => true, // sync path
    });
    button.click();
    await Promise.resolve();
    expect(editor.state.doc.toString()).toBe('NEW');
  });
});
