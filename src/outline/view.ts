// Outline sidebar renderer.
// Listens for doc changes (via an external subscribe callback), parses, and
// renders a clickable list. Each click scrolls the editor to that line.

import type { EditorView } from 'codemirror';

import { parseOutline, type OutlineEntry } from './parse';

export interface OutlineController {
  /** Call whenever the editor document changes to refresh the outline. */
  update(source: string): void;
  /** Show or hide the outline sidebar via the app-shell data attribute. */
  setOpen(open: boolean): void;
  isOpen(): boolean;
  /** Flip current state; returns the new open state. */
  toggle(): boolean;
}

export interface OutlineOptions {
  /** `.outline-list` ul element. */
  list: HTMLUListElement | null;
  /** `.app-shell` root — data-outline-open is toggled here. */
  shell: HTMLElement | null;
  /** Optional activity-bar toggle button — aria-pressed stays in sync. */
  toggleButton?: HTMLButtonElement | null;
  /** Editor view to jump to on row click. */
  editor: EditorView;
}

export function createOutline(opts: OutlineOptions): OutlineController {
  const { list, shell, toggleButton, editor } = opts;

  function update(source: string): void {
    if (!list) return;
    const entries = parseOutline(source);
    list.innerHTML = '';
    if (entries.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'outline-empty';
      empty.textContent = 'No structure detected yet.';
      list.append(empty);
      return;
    }
    for (const entry of entries) {
      list.append(renderEntry(entry));
    }
  }

  function renderEntry(entry: OutlineEntry): HTMLLIElement {
    const li = document.createElement('li');
    li.className = 'outline-item';
    li.dataset.kind = entry.kind;
    li.dataset.line = String(entry.line);
    li.style.setProperty('--outline-depth', String(entry.depth));
    li.setAttribute('role', 'treeitem');
    li.setAttribute('tabindex', '0');

    const icon = document.createElement('i');
    icon.setAttribute('aria-hidden', 'true');
    icon.className = `ri-${iconForKind(entry.kind)}`;

    const span = document.createElement('span');
    span.textContent = entry.label;

    li.append(icon, span);

    const jump = () => jumpToLine(entry.line);
    li.addEventListener('click', jump);
    li.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        jump();
      }
    });
    return li;
  }

  function jumpToLine(line: number): void {
    const doc = editor.state.doc;
    /* v8 ignore next — defensive guard; outline entries always have valid lines. */
    if (line < 1 || line > doc.lines) return;
    const linePos = doc.line(line);
    editor.dispatch({
      selection: { anchor: linePos.from, head: linePos.from },
      effects: [],
      scrollIntoView: true,
    });
    editor.focus();
  }

  function setOpen(open: boolean): void {
    if (!shell) return;
    shell.dataset.outlineOpen = String(open);
    toggleButton?.setAttribute('aria-pressed', String(open));
  }

  function isOpen(): boolean {
    return shell?.dataset.outlineOpen === 'true';
  }

  function toggle(): boolean {
    const next = !isOpen();
    setOpen(next);
    return next;
  }

  return { update, setOpen, isOpen, toggle };
}

function iconForKind(kind: OutlineEntry['kind']): string {
  switch (kind) {
    case 'header':
      return 'flow-chart';
    case 'subgraph':
      return 'folder-3-line';
    case 'participant':
      return 'user-3-line';
    case 'class':
      return 'code-box-line';
    case 'node':
    default:
      return 'checkbox-blank-circle-line';
  }
}
