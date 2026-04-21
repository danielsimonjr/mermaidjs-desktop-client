// Command palette UI — modal with fuzzy search and keyboard nav.
//
// Open:   palette.open()
// Close:  palette.close()
// Toggle: palette.toggle()

import type { Command, CommandRegistry } from './registry';
import { fuzzyScore } from './fuzzy';

export interface PaletteController {
  open(): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
  /** Remove the global keydown listener + any DOM. Use for teardown / tests. */
  destroy(): void;
}

export function createPalette(registry: CommandRegistry): PaletteController {
  let overlay: HTMLDivElement | null = null;
  let input: HTMLInputElement | null = null;
  let list: HTMLUListElement | null = null;
  let selectedIndex = 0;
  let currentResults: Command[] = [];

  function buildDom(): void {
    overlay = document.createElement('div');
    overlay.className = 'palette-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const palette = document.createElement('div');
    palette.className = 'palette';

    input = document.createElement('input');
    input.className = 'palette-input';
    input.type = 'text';
    input.placeholder = 'Type a command…';
    input.setAttribute('aria-label', 'Filter commands');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');

    list = document.createElement('ul');
    list.className = 'palette-list';
    list.setAttribute('role', 'listbox');

    palette.append(input, list);
    overlay.append(palette);

    input.addEventListener('input', () => {
      selectedIndex = 0;
      render();
    });
    input.addEventListener('keydown', onInputKeydown);
    overlay.addEventListener('pointerdown', (e) => {
      if (e.target === overlay) close();
    });
  }

  function onInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSelection(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection(-1);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      selectedIndex = 0;
      render();
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      selectedIndex = Math.max(0, currentResults.length - 1);
      render();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      executeSelected();
    }
  }

  function moveSelection(delta: number): void {
    if (currentResults.length === 0) return;
    selectedIndex = (selectedIndex + delta + currentResults.length) % currentResults.length;
    render();
  }

  async function executeSelected(): Promise<void> {
    const cmd = currentResults[selectedIndex];
    if (!cmd) return;
    close();
    try {
      await cmd.run();
    } catch (err) {
      console.error(`Command "${cmd.id}" threw:`, err);
    }
  }

  function render(): void {
    if (!list || !input) return;
    const query = input.value.trim();
    const commands = registry.available();

    const ranked = query
      ? commands
          .map((c) => {
            // Score against "Category > Label" so categories influence matches.
            const text = c.category ? `${c.category} ${c.label}` : c.label;
            const score = fuzzyScore(query, text);
            return score ? { c, score: score.score } : null;
          })
          .filter((x): x is { c: Command; score: number } => x !== null)
          .sort((a, b) => b.score - a.score)
          .map((x) => x.c)
      : commands;

    currentResults = ranked;
    if (selectedIndex >= currentResults.length) {
      selectedIndex = Math.max(0, currentResults.length - 1);
    }

    list.innerHTML = '';
    if (ranked.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'palette-empty';
      empty.textContent = query ? `No commands match "${query}"` : 'No commands registered.';
      list.append(empty);
      return;
    }
    ranked.forEach((cmd, i) => {
      const item = document.createElement('li');
      item.className = 'palette-item';
      item.dataset.commandId = cmd.id;
      item.setAttribute('role', 'option');
      if (i === selectedIndex) {
        item.dataset.selected = 'true';
        item.setAttribute('aria-selected', 'true');
      }

      const icon = document.createElement('i');
      icon.className = `palette-icon ri-${cmd.icon || 'command-line'}`;
      icon.setAttribute('aria-hidden', 'true');

      const label = document.createElement('span');
      label.className = 'palette-label';
      label.textContent = cmd.category ? `${cmd.category} › ${cmd.label}` : cmd.label;

      const kb = document.createElement('span');
      kb.className = 'palette-keybinding';
      if (cmd.keybinding) {
        for (const key of cmd.keybinding) {
          const span = document.createElement('span');
          span.className = 'kbd';
          span.textContent = key;
          kb.append(span);
        }
      }

      item.append(icon, label, kb);
      item.addEventListener('mousemove', () => {
        if (selectedIndex !== i) {
          selectedIndex = i;
          render();
        }
      });
      item.addEventListener('click', () => {
        selectedIndex = i;
        void executeSelected();
      });
      list!.append(item);
    });

    // Keep the selected item in view.
    const selected = list.querySelector<HTMLElement>('[data-selected="true"]');
    selected?.scrollIntoView({ block: 'nearest' });
  }

  function open(): void {
    if (!overlay) buildDom();
    if (overlay && !overlay.isConnected) {
      document.body.append(overlay);
    }
    if (input) {
      input.value = '';
      selectedIndex = 0;
      render();
      // Defer focus to after the browser paints the overlay (so animations work).
      requestAnimationFrame(() => input?.focus());
    }
  }

  function close(): void {
    if (overlay?.isConnected) overlay.remove();
  }

  function isOpen(): boolean {
    return overlay?.isConnected === true;
  }

  function toggle(): void {
    isOpen() ? close() : open();
  }

  // Global Ctrl+K / Cmd+K opens the palette unless focus is in another input.
  const onGlobalKeydown = (event: KeyboardEvent): void => {
    if (!event.ctrlKey && !event.metaKey) return;
    if (event.key.toLowerCase() !== 'k') return;
    event.preventDefault();
    toggle();
  };
  window.addEventListener('keydown', onGlobalKeydown);

  function destroy(): void {
    close();
    window.removeEventListener('keydown', onGlobalKeydown);
  }

  return { open, close, toggle, isOpen, destroy };
}
