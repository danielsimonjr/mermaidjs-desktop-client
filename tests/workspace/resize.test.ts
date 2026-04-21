import { describe, it, expect, vi } from 'vitest';

import { initHorizontalResize } from '../../src/workspace/resize';

function makeLayout() {
  const container = document.createElement('div');
  const editor = document.createElement('section');
  const preview = document.createElement('section');
  const divider = document.createElement('div');
  container.append(editor, divider, preview);
  document.body.appendChild(container);

  // Happy-DOM returns zeros for getBoundingClientRect; stub to realistic values.
  container.getBoundingClientRect = () =>
    ({ x: 0, y: 0, width: 1000, height: 600, top: 0, left: 0, right: 1000, bottom: 600, toJSON() {} }) as DOMRect;
  editor.getBoundingClientRect = () =>
    ({ x: 0, y: 0, width: 500, height: 600, top: 0, left: 0, right: 500, bottom: 600, toJSON() {} }) as DOMRect;

  return { container, editor, preview, divider };
}

describe('initHorizontalResize', () => {
  it('is a no-op when any element is null', () => {
    expect(() => initHorizontalResize(null, null, null, null)).not.toThrow();
    const { container } = makeLayout();
    expect(() => initHorizontalResize(container, null, null, null)).not.toThrow();
  });

  it('applies the default 0.5 split on init', () => {
    const { container, editor, preview, divider } = makeLayout();
    initHorizontalResize(container, editor, preview, divider);
    expect(editor.style.flex).toBe('0.5 1 0px');
    expect(preview.style.flex).toBe('0.5 1 0px');
  });

  it('pointer drag updates the split within the [0.2, 0.8] clamp', () => {
    const { container, editor, preview, divider } = makeLayout();
    initHorizontalResize(container, editor, preview, divider);

    // Start at x=500 (center), drag right by 100px -> ratio becomes 600/1000 = 0.6
    divider.dispatchEvent(new PointerEvent('pointerdown', { clientX: 500, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 600 }));
    expect(editor.style.flex).toBe('0.6 1 0px');
    expect(preview.style.flex).toBe('0.4 1 0px');
    window.dispatchEvent(new PointerEvent('pointerup'));
  });

  it('clamps below 0.2 when dragging far left', () => {
    const { container, editor, preview, divider } = makeLayout();
    initHorizontalResize(container, editor, preview, divider);
    divider.dispatchEvent(new PointerEvent('pointerdown', { clientX: 500 }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 0 }));
    expect(editor.style.flex).toBe('0.2 1 0px');
    window.dispatchEvent(new PointerEvent('pointerup'));
  });

  it('clamps above 0.8 when dragging far right', () => {
    const { container, editor, preview, divider } = makeLayout();
    initHorizontalResize(container, editor, preview, divider);
    divider.dispatchEvent(new PointerEvent('pointerdown', { clientX: 500 }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 10000 }));
    expect(editor.style.flex).toBe('0.8 1 0px');
    window.dispatchEvent(new PointerEvent('pointerup'));
  });

  it('ignores pointermove events when not dragging', () => {
    const { container, editor, preview, divider } = makeLayout();
    initHorizontalResize(container, editor, preview, divider);
    const originalFlex = editor.style.flex;
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 900 }));
    expect(editor.style.flex).toBe(originalFlex);
  });

  it('toggles the "dragging" class on start and stop', () => {
    const { container, editor, preview, divider } = makeLayout();
    initHorizontalResize(container, editor, preview, divider);
    divider.dispatchEvent(new PointerEvent('pointerdown', { clientX: 500 }));
    expect(divider.classList.contains('dragging')).toBe(true);
    window.dispatchEvent(new PointerEvent('pointerup'));
    expect(divider.classList.contains('dragging')).toBe(false);
  });

  it('stopDragging is a no-op when not dragging', () => {
    const { container, editor, preview, divider } = makeLayout();
    initHorizontalResize(container, editor, preview, divider);
    // Fire pointerup without a prior pointerdown — covers the !isDragging branch.
    expect(() => window.dispatchEvent(new PointerEvent('pointerup'))).not.toThrow();
    expect(divider.classList.contains('dragging')).toBe(false);
  });

  it('double-click on divider resets to 0.5', () => {
    const { container, editor, preview, divider } = makeLayout();
    initHorizontalResize(container, editor, preview, divider);
    divider.dispatchEvent(new PointerEvent('pointerdown', { clientX: 500 }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 700 }));
    window.dispatchEvent(new PointerEvent('pointerup'));
    expect(editor.style.flex).not.toBe('0.5 1 0px');

    divider.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(editor.style.flex).toBe('0.5 1 0px');
  });
});
