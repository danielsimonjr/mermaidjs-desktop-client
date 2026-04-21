import { describe, it, expect, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { setupToolbarActions } from '../../src/toolbar/actions';

function makeEditor(doc = 'seed') {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return new EditorView({
    parent: host,
    state: EditorState.create({ doc, extensions: [] }),
  });
}

function makeButtons() {
  const mkBtn = () => document.createElement('button') as HTMLButtonElement;
  const mkDiv = () => document.createElement('div') as HTMLDivElement;
  return {
    newDiagramButton: mkBtn(),
    openButton: mkBtn(),
    saveButton: mkBtn(),
    exportButton: mkBtn(),
    exportMenu: mkDiv(),
    examplesButton: mkBtn(),
    examplesMenu: mkDiv(),
  };
}

describe('setupToolbarActions', () => {
  it('wires up all four actions without error', () => {
    const editor = makeEditor();
    const opts = {
      editor,
      schedulePreviewRender: vi.fn(),
      isDirty: () => false,
      commitDocument: vi.fn(),
      onPathChange: vi.fn(),
      getPath: () => null,
      defaultSnippet: 'DEFAULT',
      ...makeButtons(),
    };
    expect(() => setupToolbarActions(opts)).not.toThrow();
  });

  it('isDirty=false skips the confirmation dialog on New', async () => {
    const editor = makeEditor();
    const buttons = makeButtons();
    const commitDocument = vi.fn();
    setupToolbarActions({
      editor,
      schedulePreviewRender: vi.fn(),
      isDirty: () => false,
      commitDocument,
      onPathChange: vi.fn(),
      getPath: () => null,
      defaultSnippet: 'DEFAULT',
      ...buttons,
    });

    buttons.newDiagramButton.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(window.api.dialog.ask).not.toHaveBeenCalled();
    expect(commitDocument).toHaveBeenCalledWith('DEFAULT');
  });

  it('isDirty=true shows confirm on New and aborts if user declines', async () => {
    const editor = makeEditor();
    const buttons = makeButtons();
    vi.mocked(window.api.dialog.ask).mockResolvedValueOnce(false);
    const commitDocument = vi.fn();
    setupToolbarActions({
      editor,
      schedulePreviewRender: vi.fn(),
      isDirty: () => true,
      commitDocument,
      onPathChange: vi.fn(),
      getPath: () => null,
      defaultSnippet: 'DEFAULT',
      ...buttons,
    });

    buttons.newDiagramButton.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(window.api.dialog.ask).toHaveBeenCalled();
    expect(commitDocument).not.toHaveBeenCalled();
  });

  it('Open-diagram: isDirty=true + user confirms → file loads', async () => {
    const editor = makeEditor('unsaved');
    const buttons = makeButtons();
    vi.mocked(window.api.dialog.showOpenDialog).mockResolvedValueOnce('/picked.mmd');
    vi.mocked(window.api.fs.readTextFile).mockResolvedValueOnce('fresh content');
    vi.mocked(window.api.dialog.ask).mockResolvedValueOnce(true);
    const commitDocument = vi.fn();
    setupToolbarActions({
      editor,
      schedulePreviewRender: vi.fn(),
      isDirty: () => true,
      commitDocument,
      onPathChange: vi.fn(),
      getPath: () => null,
      defaultSnippet: 'DEFAULT',
      ...buttons,
    });
    buttons.openButton.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(window.api.dialog.ask).toHaveBeenCalled();
    expect(editor.state.doc.toString()).toBe('fresh content');
    expect(commitDocument).toHaveBeenCalledWith('fresh content');
  });

  it('Open-diagram path: showOpenDialog + readTextFile + commitDocument', async () => {
    const editor = makeEditor();
    const buttons = makeButtons();
    vi.mocked(window.api.dialog.showOpenDialog).mockResolvedValueOnce('/picked.mmd');
    vi.mocked(window.api.fs.readTextFile).mockResolvedValueOnce('loaded content');
    const commitDocument = vi.fn();
    setupToolbarActions({
      editor,
      schedulePreviewRender: vi.fn(),
      isDirty: () => false,
      commitDocument,
      onPathChange: vi.fn(),
      getPath: () => null,
      defaultSnippet: 'DEFAULT',
      ...buttons,
    });

    buttons.openButton.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(editor.state.doc.toString()).toBe('loaded content');
    expect(commitDocument).toHaveBeenCalledWith('loaded content');
  });

  it('Save-diagram path: goes through showSaveDialog when no current path', async () => {
    const editor = makeEditor('to save');
    const buttons = makeButtons();
    vi.mocked(window.api.dialog.showSaveDialog).mockResolvedValueOnce('/chosen.mmd');
    const commitDocument = vi.fn();
    setupToolbarActions({
      editor,
      schedulePreviewRender: vi.fn(),
      isDirty: () => false,
      commitDocument,
      onPathChange: vi.fn(),
      getPath: () => null,
      defaultSnippet: 'DEFAULT',
      ...buttons,
    });

    buttons.saveButton.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(window.api.fs.writeTextFile).toHaveBeenCalledWith('/chosen.mmd', 'to save');
    expect(commitDocument).toHaveBeenCalledWith('to save', { saved: true });
  });

  it('Examples menu: selecting an example replaces editor content', async () => {
    const editor = makeEditor('old');
    const buttons = makeButtons();
    const schedule = vi.fn();
    const onPathChange = vi.fn();
    setupToolbarActions({
      editor,
      schedulePreviewRender: schedule,
      isDirty: () => false,
      commitDocument: vi.fn(),
      onPathChange,
      getPath: () => null,
      defaultSnippet: 'DEFAULT',
      ...buttons,
    });

    // Open the menu and click the first rendered example (Vite glob loads src/examples/*.mmd).
    buttons.examplesButton.click();
    const items = buttons.examplesMenu.querySelectorAll<HTMLButtonElement>('.toolbar-menu-item');
    expect(items.length).toBeGreaterThan(0);
    items[0].click();
    await new Promise((r) => setTimeout(r, 0));

    // Editor should now contain the example content (non-empty).
    expect(editor.state.doc.length).toBeGreaterThan(0);
    expect(editor.state.doc.toString()).not.toBe('old');
    expect(schedule).toHaveBeenCalled();
    expect(onPathChange).toHaveBeenCalledWith(null);
  });

  it('Examples menu: isDirty + decline → example NOT loaded', async () => {
    const editor = makeEditor('keep me');
    const buttons = makeButtons();
    vi.mocked(window.api.dialog.ask).mockResolvedValueOnce(false);
    setupToolbarActions({
      editor,
      schedulePreviewRender: vi.fn(),
      isDirty: () => true,
      commitDocument: vi.fn(),
      onPathChange: vi.fn(),
      getPath: () => null,
      defaultSnippet: 'DEFAULT',
      ...buttons,
    });

    buttons.examplesButton.click();
    const first = buttons.examplesMenu.querySelector<HTMLButtonElement>('.toolbar-menu-item')!;
    first.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(editor.state.doc.toString()).toBe('keep me');
  });

  it('confirmReplace fails safe when dialog throws', async () => {
    const editor = makeEditor('x');
    const buttons = makeButtons();
    vi.mocked(window.api.dialog.ask).mockRejectedValueOnce(new Error('no bridge'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const commitDocument = vi.fn();
    setupToolbarActions({
      editor,
      schedulePreviewRender: vi.fn(),
      isDirty: () => true,
      commitDocument,
      onPathChange: vi.fn(),
      getPath: () => null,
      defaultSnippet: 'DEFAULT',
      ...buttons,
    });

    buttons.newDiagramButton.click();
    await new Promise((r) => setTimeout(r, 0));
    // Destructive action must NOT proceed.
    expect(commitDocument).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
