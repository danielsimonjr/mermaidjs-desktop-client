import { describe, it, expect, vi } from 'vitest';

import { createDropdown } from '../../src/ui/dropdown';

function makePair() {
  const button = document.createElement('button');
  const menu = document.createElement('div');
  menu.hidden = true;
  document.body.append(button, menu);
  // Stub getBoundingClientRect for positioning calculations.
  button.getBoundingClientRect = () =>
    ({ x: 100, y: 50, width: 36, height: 36, top: 50, left: 100, right: 136, bottom: 86, toJSON() {} }) as DOMRect;
  return { button, menu };
}

describe('createDropdown', () => {
  it('starts closed; open() reveals the menu', () => {
    const { button, menu } = makePair();
    const d = createDropdown({ button, menu });
    expect(d.isOpen()).toBe(false);
    d.open();
    expect(d.isOpen()).toBe(true);
    expect(menu.hidden).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('close() hides the menu and clears aria-expanded', () => {
    const { button, menu } = makePair();
    const d = createDropdown({ button, menu });
    d.open();
    d.close();
    expect(menu.hidden).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('toggle() flips state', () => {
    const { button, menu } = makePair();
    const d = createDropdown({ button, menu });
    d.toggle();
    expect(d.isOpen()).toBe(true);
    d.toggle();
    expect(d.isOpen()).toBe(false);
  });

  it('button click opens the dropdown', () => {
    const { button, menu } = makePair();
    createDropdown({ button, menu });
    button.click();
    expect(menu.hidden).toBe(false);
  });

  it('positions the menu to the right of the button by default', () => {
    const { button, menu } = makePair();
    const d = createDropdown({ button, menu });
    d.open();
    expect(menu.style.top).toBe('50px');
    expect(menu.style.left).toBe('142px'); // right (136) + 6
  });

  it('positions below when placement = "below"', () => {
    const { button, menu } = makePair();
    const d = createDropdown({ button, menu, placement: 'below' });
    d.open();
    expect(menu.style.top).toBe('90px'); // bottom (86) + 4
    expect(menu.style.left).toBe('100px');
  });

  it('outside pointerdown closes the menu', () => {
    const { button, menu } = makePair();
    const d = createDropdown({ button, menu });
    d.open();
    const outside = document.createElement('div');
    document.body.append(outside);
    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(d.isOpen()).toBe(false);
  });

  it('pointerdown on the menu does NOT close', () => {
    const { button, menu } = makePair();
    const d = createDropdown({ button, menu });
    d.open();
    menu.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(d.isOpen()).toBe(true);
  });

  it('pointerdown on the button does NOT close (the button click toggles instead)', () => {
    const { button, menu } = makePair();
    const d = createDropdown({ button, menu });
    d.open();
    button.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(d.isOpen()).toBe(true);
  });

  it('Escape closes the menu when open', () => {
    const { button, menu } = makePair();
    const d = createDropdown({ button, menu });
    d.open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(d.isOpen()).toBe(false);
  });

  it('non-Escape keys are ignored', () => {
    const { button, menu } = makePair();
    const d = createDropdown({ button, menu });
    d.open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(d.isOpen()).toBe(true);
  });

  it('setOpen(true) twice is idempotent', () => {
    const { button, menu } = makePair();
    const d = createDropdown({ button, menu });
    d.open();
    d.open();
    expect(d.isOpen()).toBe(true);
  });

  it('resize event repositions the menu', () => {
    const { button, menu } = makePair();
    const d = createDropdown({ button, menu });
    d.open();
    // Move the button.
    button.getBoundingClientRect = () =>
      ({ x: 0, y: 200, width: 36, height: 36, top: 200, left: 0, right: 36, bottom: 236, toJSON() {} }) as DOMRect;
    window.dispatchEvent(new Event('resize'));
    expect(menu.style.top).toBe('200px');
  });
});
