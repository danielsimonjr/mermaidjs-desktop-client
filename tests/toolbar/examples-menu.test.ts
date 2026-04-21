import { describe, it, expect, vi } from 'vitest';

import { setupExamplesMenu, type ExampleItem } from '../../src/toolbar/examples-menu';

const SAMPLE: ExampleItem[] = [
  { id: 'flow', label: 'Flowchart', content: 'graph TD\n A-->B', order: 1 },
  { id: 'seq', label: 'Sequence', content: 'sequenceDiagram', order: 2 },
];

function setup(items = SAMPLE) {
  const button = document.createElement('button');
  const menu = document.createElement('div') as HTMLDivElement;
  menu.hidden = true;
  document.body.appendChild(button);
  document.body.appendChild(menu);
  const onSelect = vi.fn();
  setupExamplesMenu({ button, menu, items, onSelect });
  return { button, menu, onSelect };
}

describe('setupExamplesMenu', () => {
  it('is a no-op when button is null', () => {
    expect(() =>
      setupExamplesMenu({ button: null, menu: document.createElement('div'), items: SAMPLE })
    ).not.toThrow();
  });

  it('is a no-op when menu is null', () => {
    expect(() =>
      setupExamplesMenu({ button: document.createElement('button'), menu: null, items: SAMPLE })
    ).not.toThrow();
  });

  it('is a no-op when items is empty', () => {
    const { menu } = setup([]);
    expect(menu.innerHTML).toBe('');
  });

  it('renders an item per example with correct label + data attr', () => {
    const { menu } = setup();
    const items = menu.querySelectorAll<HTMLButtonElement>('.toolbar-menu-item');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toBe('Flowchart');
    expect(items[0].dataset.example).toBe('flow');
    expect(items[1].dataset.example).toBe('seq');
  });

  it('opens on click and closes on repeat click', () => {
    const { button, menu } = setup();
    button.click();
    expect(menu.hidden).toBe(false);
    button.click();
    expect(menu.hidden).toBe(true);
  });

  it('opens on ArrowDown from the button', () => {
    const { button, menu } = setup();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(menu.hidden).toBe(false);
  });

  it('selects an item and calls onSelect with content + item', () => {
    const { button, menu, onSelect } = setup();
    button.click();
    const first = menu.querySelector<HTMLButtonElement>('.toolbar-menu-item')!;
    first.click();
    expect(onSelect).toHaveBeenCalledWith(SAMPLE[0].content, SAMPLE[0]);
    expect(menu.hidden).toBe(true);
  });

  it('ignores clicks on items with stale data-example', () => {
    const { button, menu, onSelect } = setup();
    button.click();
    const first = menu.querySelector<HTMLButtonElement>('.toolbar-menu-item')!;
    first.dataset.example = 'does-not-exist';
    first.click();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('ignores clicks on items missing data-example entirely', () => {
    const { button, menu, onSelect } = setup();
    button.click();
    const first = menu.querySelector<HTMLButtonElement>('.toolbar-menu-item')!;
    delete first.dataset.example;
    first.click();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('ignores menu clicks that are not on items', () => {
    const { button, menu, onSelect } = setup();
    button.click();
    menu.click();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('closes on outside pointerdown', () => {
    const { button, menu } = setup();
    button.click();
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(menu.hidden).toBe(true);
  });

  it('closes on Escape inside menu', () => {
    const { button, menu } = setup();
    button.click();
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu.hidden).toBe(true);
  });

  it('closes on document Escape when open', () => {
    const { button, menu } = setup();
    button.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(menu.hidden).toBe(true);
  });

  it('button keydown: non-ArrowDown is ignored', () => {
    const { button, menu } = setup();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(menu.hidden).toBe(true);
  });

  it('document keydown: non-Escape while open is ignored', () => {
    const { button, menu } = setup();
    button.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(menu.hidden).toBe(false);
  });

  it('menu Escape while closed is a no-op', () => {
    const { menu } = setup();
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu.hidden).toBe(true);
  });

  it('ArrowDown when already open does not re-enter open state', () => {
    const { button, menu } = setup();
    button.click(); // open
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(menu.hidden).toBe(false);
  });
});
