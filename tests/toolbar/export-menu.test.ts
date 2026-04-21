import { describe, it, expect, vi } from 'vitest';

import { setupExportMenu } from '../../src/toolbar/export-menu';

function makeMenuDom() {
  const button = document.createElement('button');
  const menu = document.createElement('div');
  menu.hidden = true;
  menu.innerHTML = `
    <button class="toolbar-menu-item" data-export="png">PNG</button>
    <button class="toolbar-menu-item" data-export="pngx2">PNG @2x</button>
    <button class="toolbar-menu-item" data-export="svg">SVG</button>
    <button class="toolbar-menu-item">No-format (ignored)</button>
  `;
  document.body.appendChild(button);
  document.body.appendChild(menu);
  return { button, menu };
}

describe('setupExportMenu', () => {
  it('is a no-op when button or menu is missing', () => {
    expect(() =>
      setupExportMenu({ button: null, menu: document.createElement('div') })
    ).not.toThrow();
    expect(() =>
      setupExportMenu({ button: document.createElement('button'), menu: null })
    ).not.toThrow();
  });

  it('toggles open/closed on button click', () => {
    const { button, menu } = makeMenuDom();
    setupExportMenu({ button, menu });
    expect(menu.hidden).toBe(true);
    button.click();
    expect(menu.hidden).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    button.click();
    expect(menu.hidden).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens and focuses first item on ArrowDown', () => {
    const { button, menu } = makeMenuDom();
    setupExportMenu({ button, menu });
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(menu.hidden).toBe(false);
  });

  it('calls onSelect with the format and closes the menu on item click', async () => {
    const { button, menu } = makeMenuDom();
    const onSelect = vi.fn();
    setupExportMenu({ button, menu, onSelect });
    button.click();
    const png = menu.querySelector<HTMLButtonElement>('[data-export="png"]')!;
    png.click();
    expect(onSelect).toHaveBeenCalledWith('png');
    expect(menu.hidden).toBe(true);
  });

  it('ignores clicks on menu items without data-export', () => {
    const { button, menu } = makeMenuDom();
    const onSelect = vi.fn();
    setupExportMenu({ button, menu, onSelect });
    button.click();
    const plain = menu.querySelectorAll<HTMLButtonElement>('.toolbar-menu-item')[3];
    plain!.click();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('ignores clicks outside menu items entirely', () => {
    const { button, menu } = makeMenuDom();
    const onSelect = vi.fn();
    setupExportMenu({ button, menu, onSelect });
    button.click();
    // Click on the menu container itself, not on any item.
    menu.click();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('closes on Escape inside the menu', () => {
    const { button, menu } = makeMenuDom();
    setupExportMenu({ button, menu });
    button.click();
    expect(menu.hidden).toBe(false);
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu.hidden).toBe(true);
  });

  it('closes on pointerdown outside the menu + button', () => {
    const { button, menu } = makeMenuDom();
    setupExportMenu({ button, menu });
    button.click();
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(menu.hidden).toBe(true);
  });

  it('keeps open when pointerdown is inside the menu or button', () => {
    const { button, menu } = makeMenuDom();
    setupExportMenu({ button, menu });
    button.click();
    const first = menu.querySelector<HTMLButtonElement>('.toolbar-menu-item')!;
    first.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(menu.hidden).toBe(false);
  });

  it('closes on document Escape keydown while open', () => {
    const { button, menu } = makeMenuDom();
    setupExportMenu({ button, menu });
    button.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(menu.hidden).toBe(true);
  });

  it('ignores other keys on document keydown handler', () => {
    const { button, menu } = makeMenuDom();
    setupExportMenu({ button, menu });
    button.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(menu.hidden).toBe(false);
  });

  it('ArrowDown when already open focuses first item but does not re-open', () => {
    const { button, menu } = makeMenuDom();
    setupExportMenu({ button, menu });
    button.click();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(menu.hidden).toBe(false);
  });

  it('button keydown ignores non-ArrowDown keys', () => {
    const { button, menu } = makeMenuDom();
    setupExportMenu({ button, menu });
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(menu.hidden).toBe(true);
  });

  it('menu Escape is ignored when menu already closed', () => {
    const { button, menu } = makeMenuDom();
    setupExportMenu({ button, menu });
    // Menu starts hidden; firing Escape must be a no-op.
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu.hidden).toBe(true);
  });

  it('setOpen is idempotent — calling open twice does not re-toggle listeners', () => {
    const { button, menu } = makeMenuDom();
    setupExportMenu({ button, menu });
    button.click();
    // Second click toggles to close.
    button.click();
    // Third click re-opens. Each setOpen invocation with a different state toggles listeners.
    button.click();
    // Re-click ArrowDown while already open → setOpen(true) hits the `isOpen === open` early return.
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(menu.hidden).toBe(false);
  });
});
