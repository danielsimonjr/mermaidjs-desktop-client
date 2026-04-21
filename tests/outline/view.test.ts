import { describe, it, expect, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { createOutline } from '../../src/outline/view';

function setup() {
  const shell = document.createElement('div');
  shell.className = 'app-shell';
  shell.dataset.outlineOpen = 'false';
  document.body.appendChild(shell);

  const list = document.createElement('ul');
  list.className = 'outline-list';

  const toggleButton = document.createElement('button');
  toggleButton.type = 'button';

  const host = document.createElement('div');
  document.body.appendChild(host);
  const editor = new EditorView({
    parent: host,
    state: EditorState.create({ doc: '', extensions: [] }),
  });

  const outline = createOutline({ list, shell, toggleButton, editor });
  return { shell, list, toggleButton, editor, outline };
}

describe('createOutline', () => {
  it('shows an empty-state message when no structure is detected', () => {
    const { list, outline } = setup();
    outline.update('plain text no structure');
    expect(list.querySelector('.outline-empty')).toBeTruthy();
  });

  it('renders an item per parsed entry', () => {
    const { list, outline } = setup();
    outline.update('graph TD\n  subgraph One\n    A[Start] --> B[End]\n  end');
    const items = list.querySelectorAll('.outline-item');
    expect(items.length).toBeGreaterThanOrEqual(3); // header + subgraph + 2 nodes
  });

  it('sets data-kind based on entry type', () => {
    const { list, outline } = setup();
    outline.update('graph TD\n  A[Start]');
    const kinds = [...list.querySelectorAll('.outline-item')].map((n) =>
      (n as HTMLElement).dataset.kind
    );
    expect(kinds).toContain('header');
    expect(kinds).toContain('node');
  });

  it('applies --outline-depth CSS variable from depth', () => {
    const { list, outline } = setup();
    outline.update('graph TD\n subgraph Outer\n  subgraph Inner\n   A\n  end\n end');
    const sub = list.querySelectorAll<HTMLElement>('[data-kind="subgraph"]');
    expect(sub.length).toBe(2);
    expect(sub[0].style.getPropertyValue('--outline-depth')).toBe('0');
    expect(sub[1].style.getPropertyValue('--outline-depth')).toBe('1');
  });

  it('clicking an item moves the editor selection to that line', () => {
    const { list, editor, outline } = setup();
    editor.dispatch({
      changes: { from: 0, to: 0, insert: 'graph TD\n  A[Start]\n  B[End]' },
    });
    outline.update(editor.state.doc.toString());
    const items = list.querySelectorAll<HTMLElement>('.outline-item');
    const bItem = [...items].find((n) => n.textContent?.includes('B'));
    bItem?.click();
    const line = editor.state.doc.lineAt(editor.state.selection.main.head);
    expect(line.text).toContain('B[End]');
  });

  it('Enter / Space on a focused row triggers jump', () => {
    const { list, editor, outline } = setup();
    editor.dispatch({ changes: { from: 0, to: 0, insert: 'graph TD\n  A[Go]' } });
    outline.update(editor.state.doc.toString());
    const aItem = list.querySelector<HTMLElement>('[data-kind="node"]')!;
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    aItem.dispatchEvent(event);
    const line = editor.state.doc.lineAt(editor.state.selection.main.head);
    expect(line.text).toContain('A[Go]');
  });

  it('setOpen toggles the shell data attribute and button aria-pressed', () => {
    const { shell, toggleButton, outline } = setup();
    outline.setOpen(true);
    expect(shell.dataset.outlineOpen).toBe('true');
    expect(toggleButton.getAttribute('aria-pressed')).toBe('true');
    outline.setOpen(false);
    expect(shell.dataset.outlineOpen).toBe('false');
  });

  it('toggle flips and returns new state', () => {
    const { outline } = setup();
    expect(outline.isOpen()).toBe(false);
    expect(outline.toggle()).toBe(true);
    expect(outline.toggle()).toBe(false);
  });

  it('ignores invalid line numbers in jump', () => {
    const { list, outline, editor } = setup();
    editor.dispatch({ changes: { from: 0, to: 0, insert: 'graph TD\n  A[Start]' } });
    outline.update(editor.state.doc.toString());
    // Create a synthetic item with an out-of-range line and click it.
    const fakeItem = list.querySelector<HTMLElement>('.outline-item')!;
    fakeItem.dataset.line = '999';
    // clicking still calls the handler; it should simply not crash.
    expect(() => fakeItem.click()).not.toThrow();
  });
});
