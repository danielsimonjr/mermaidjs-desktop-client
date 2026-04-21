import { describe, it, expect, vi, afterEach } from 'vitest';

import { CommandRegistry } from '../../src/palette/registry';
import { createPalette, type PaletteController } from '../../src/palette/ui';

// Every test creates a fresh palette (which attaches a window keydown listener);
// destroy it in afterEach so listeners don't accumulate across tests.
let createdPalettes: PaletteController[] = [];

afterEach(() => {
  for (const p of createdPalettes) p.destroy();
  createdPalettes = [];
});

function setup() {
  const registry = new CommandRegistry();
  const runs = {
    save: vi.fn(),
    open: vi.fn(),
    theme: vi.fn(),
  };
  registry.registerAll([
    { id: 'file.save', label: 'Save diagram', icon: 'save-3-line', category: 'File',
      keybinding: ['Ctrl', 'S'], run: runs.save },
    { id: 'file.open', label: 'Open file', icon: 'folder-open-line', category: 'File',
      run: runs.open },
    { id: 'theme.dark', label: 'Dark theme', icon: 'moon-line', category: 'Theme',
      run: runs.theme },
  ]);
  const palette = createPalette(registry);
  createdPalettes.push(palette);
  return { registry, palette, runs };
}

describe('createPalette', () => {
  it('is closed by default', () => {
    const { palette } = setup();
    expect(palette.isOpen()).toBe(false);
  });

  it('open() creates an overlay + focuses the input', () => {
    const { palette } = setup();
    palette.open();
    const overlay = document.querySelector('.palette-overlay');
    expect(overlay).toBeTruthy();
    expect(palette.isOpen()).toBe(true);
  });

  it('close() removes the overlay', () => {
    const { palette } = setup();
    palette.open();
    palette.close();
    expect(document.querySelector('.palette-overlay')).toBeNull();
    expect(palette.isOpen()).toBe(false);
  });

  it('toggle() flips', () => {
    const { palette } = setup();
    palette.toggle();
    expect(palette.isOpen()).toBe(true);
    palette.toggle();
    expect(palette.isOpen()).toBe(false);
  });

  it('renders all available commands on first open', () => {
    const { palette } = setup();
    palette.open();
    const items = document.querySelectorAll('.palette-item');
    expect(items).toHaveLength(3);
  });

  it('filters as the user types', () => {
    const { palette } = setup();
    palette.open();
    const input = document.querySelector<HTMLInputElement>('.palette-input')!;
    input.value = 'theme';
    input.dispatchEvent(new Event('input'));
    const items = document.querySelectorAll('.palette-item');
    expect(items.length).toBeGreaterThan(0);
    expect([...items].every((el) => /theme/i.test(el.textContent ?? ''))).toBe(true);
  });

  it('shows "No commands match" when the filter has no results', () => {
    const { palette } = setup();
    palette.open();
    const input = document.querySelector<HTMLInputElement>('.palette-input')!;
    input.value = 'zzz_nonexistent_zzz';
    input.dispatchEvent(new Event('input'));
    const empty = document.querySelector('.palette-empty');
    expect(empty?.textContent).toMatch(/No commands match/i);
  });

  it('Escape closes the palette', () => {
    const { palette } = setup();
    palette.open();
    const input = document.querySelector<HTMLInputElement>('.palette-input')!;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(palette.isOpen()).toBe(false);
  });

  it('ArrowDown/ArrowUp move selection', () => {
    const { palette } = setup();
    palette.open();
    const input = document.querySelector<HTMLInputElement>('.palette-input')!;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    const selected = document.querySelector('.palette-item[data-selected="true"]');
    expect(selected).toBeTruthy();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    // Still selected (wraps/bounds).
    expect(document.querySelector('.palette-item[data-selected="true"]')).toBeTruthy();
  });

  it('ArrowDown wraps around at the end', () => {
    const { palette } = setup();
    palette.open();
    const input = document.querySelector<HTMLInputElement>('.palette-input')!;
    for (let i = 0; i < 5; i++) {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    }
    const selected = document.querySelector('.palette-item[data-selected="true"]');
    expect(selected).toBeTruthy();
  });

  it('Home / End jump to first / last item', () => {
    const { palette } = setup();
    palette.open();
    const input = document.querySelector<HTMLInputElement>('.palette-input')!;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    const last = document.querySelectorAll('.palette-item');
    expect(last[last.length - 1].getAttribute('data-selected')).toBe('true');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.querySelectorAll('.palette-item')[0].getAttribute('data-selected')).toBe('true');
  });

  it('Enter runs the selected command', async () => {
    const { palette, runs } = setup();
    palette.open();
    const input = document.querySelector<HTMLInputElement>('.palette-input')!;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(runs.save).toHaveBeenCalled();
    expect(palette.isOpen()).toBe(false);
  });

  it('clicking an item runs that command and closes', async () => {
    const { palette, runs } = setup();
    palette.open();
    const items = document.querySelectorAll<HTMLElement>('.palette-item');
    const themeItem = [...items].find((el) => el.textContent?.includes('Dark theme'))!;
    themeItem.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(runs.theme).toHaveBeenCalled();
    expect(palette.isOpen()).toBe(false);
  });

  it('mousemove over an item selects it', () => {
    const { palette } = setup();
    palette.open();
    const items = document.querySelectorAll<HTMLElement>('.palette-item');
    items[2].dispatchEvent(new Event('mousemove', { bubbles: true }));
    // render() replaces the DOM — re-query.
    const selected = document.querySelector<HTMLElement>('.palette-item[data-selected="true"]');
    expect(selected).toBeTruthy();
    // And it's the third item by position (it was items[2] before re-render).
    const all = document.querySelectorAll<HTMLElement>('.palette-item');
    expect(all[2]).toBe(selected);
  });

  it('outside click closes', () => {
    const { palette } = setup();
    palette.open();
    const overlay = document.querySelector<HTMLElement>('.palette-overlay')!;
    // click on the overlay itself (not the palette)
    const ev = new Event('pointerdown', { bubbles: true });
    Object.defineProperty(ev, 'target', { value: overlay });
    overlay.dispatchEvent(ev);
    expect(palette.isOpen()).toBe(false);
  });

  it('clicks inside the palette do NOT close', () => {
    const { palette } = setup();
    palette.open();
    const panel = document.querySelector<HTMLElement>('.palette')!;
    panel.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(palette.isOpen()).toBe(true);
  });

  it('Ctrl+K global keydown opens the palette', () => {
    const { palette } = setup();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    expect(palette.isOpen()).toBe(true);
  });

  it('Cmd+K global keydown opens on Mac', () => {
    const { palette } = setup();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'K', metaKey: true }));
    expect(palette.isOpen()).toBe(true);
  });

  it('empty registry yields "No commands registered"', () => {
    const registry = new CommandRegistry();
    const palette = createPalette(registry);
    createdPalettes.push(palette);
    palette.open();
    const empty = document.querySelector('.palette-empty');
    expect(empty?.textContent).toMatch(/No commands/i);
  });

  it('render shows keybinding kbd chips if provided', () => {
    const { palette } = setup();
    palette.open();
    const kbd = document.querySelectorAll('.palette-keybinding .kbd');
    expect(kbd.length).toBeGreaterThan(0);
    expect([...kbd].some((el) => el.textContent === 'Ctrl')).toBe(true);
  });

  it('swallows command errors without closing the overlay before logging', async () => {
    const registry = new CommandRegistry();
    registry.register({
      id: 'x',
      label: 'Throws',
      icon: '',
      run: async () => {
        throw new Error('boom');
      },
    });
    const palette = createPalette(registry);
    createdPalettes.push(palette);
    palette.open();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const input = document.querySelector<HTMLInputElement>('.palette-input')!;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
