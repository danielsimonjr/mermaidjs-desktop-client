import { describe, it, expect, vi } from 'vitest';

import {
  createZoomController,
  setupZoomControls,
  setupWheelZoom,
  updateLevelDisplay,
} from '../../src/preview/zoom';

function makePreview() {
  const root = document.createElement('div');
  root.innerHTML = '<svg></svg>';
  document.body.appendChild(root);
  return root;
}

describe('createZoomController', () => {
  it('starts at level 1', () => {
    const c = createZoomController(makePreview());
    expect(c.getLevel()).toBe(1);
  });

  it('zoomIn steps by 0.25 up to MAX (10)', () => {
    const c = createZoomController(makePreview());
    for (let i = 0; i < 200; i++) c.zoomIn();
    expect(c.getLevel()).toBe(10);
  });

  it('zoomOut clamps at MIN (0.25)', () => {
    const c = createZoomController(makePreview());
    for (let i = 0; i < 200; i++) c.zoomOut();
    expect(c.getLevel()).toBe(0.25);
  });

  it('reset returns to 1', () => {
    const c = createZoomController(makePreview());
    c.zoomIn();
    c.zoomIn();
    c.reset();
    expect(c.getLevel()).toBe(1);
  });

  it('applyZoom mutates the SVG transform and calls onZoomChange', () => {
    const preview = makePreview();
    const onChange = vi.fn();
    const c = createZoomController(preview, onChange);
    c.zoomIn();
    const svg = preview.querySelector('svg') as SVGElement;
    expect(svg.style.transform).toBe('scale(1.25)');
    expect(svg.style.transformOrigin).toBe('center center');
    expect(onChange).toHaveBeenCalledWith(1.25);
  });

  it('applyZoom is a no-op when no svg is present (does not throw)', () => {
    const empty = document.createElement('div');
    const onChange = vi.fn();
    const c = createZoomController(empty, onChange);
    expect(() => c.applyZoom()).not.toThrow();
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('zoomIn at MAX does not change level (clamp)', () => {
    const c = createZoomController(makePreview());
    for (let i = 0; i < 40; i++) c.zoomIn();
    const pinned = c.getLevel();
    c.zoomIn();
    expect(c.getLevel()).toBe(pinned);
  });

  it('zoomOut at MIN does not change level (clamp)', () => {
    const c = createZoomController(makePreview());
    for (let i = 0; i < 40; i++) c.zoomOut();
    const pinned = c.getLevel();
    c.zoomOut();
    expect(c.getLevel()).toBe(pinned);
  });
});

describe('setupZoomControls', () => {
  it('wires click handlers to controller methods', () => {
    const preview = makePreview();
    const c = createZoomController(preview);
    const zi = vi.spyOn(c, 'zoomIn');
    const zo = vi.spyOn(c, 'zoomOut');
    const rs = vi.spyOn(c, 'reset');

    const inBtn = document.createElement('button');
    const outBtn = document.createElement('button');
    const resetBtn = document.createElement('button');
    const display = document.createElement('span');

    setupZoomControls(c, inBtn, outBtn, resetBtn, display);

    inBtn.click();
    outBtn.click();
    resetBtn.click();

    expect(zi).toHaveBeenCalled();
    expect(zo).toHaveBeenCalled();
    expect(rs).toHaveBeenCalled();
    expect(display.textContent).toBe('100%');
  });

  it('tolerates null buttons (e.g. missing DOM nodes)', () => {
    const c = createZoomController(makePreview());
    expect(() => setupZoomControls(c, null, null, null, null)).not.toThrow();
  });

  it('skips display update when levelDisplay is not provided', () => {
    const c = createZoomController(makePreview());
    const inBtn = document.createElement('button');
    setupZoomControls(c, inBtn, null, null);
    // No assertion target needed — just verifying the `if (levelDisplay)` branch doesn't throw.
    expect(() => inBtn.click()).not.toThrow();
  });
});

describe('setupWheelZoom', () => {
  it('ignores wheel events without ctrlKey', () => {
    const preview = makePreview();
    const c = createZoomController(preview);
    const zi = vi.spyOn(c, 'zoomIn');
    setupWheelZoom(preview, c);
    const ev = new Event('wheel', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'deltaY', { value: -100 });
    Object.defineProperty(ev, 'ctrlKey', { value: false });
    preview.dispatchEvent(ev);
    expect(zi).not.toHaveBeenCalled();
  });

  // Happy-DOM's WheelEvent constructor doesn't always wire ctrlKey from init
  // dict; emulate the browser by dispatching a CustomEvent-shaped one.
  function wheel(deltaY: number, ctrlKey: boolean): Event {
    const ev = new Event('wheel', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'deltaY', { value: deltaY });
    Object.defineProperty(ev, 'ctrlKey', { value: ctrlKey });
    return ev;
  }

  it('zoomIn on ctrl+scroll-up', () => {
    const preview = makePreview();
    const c = createZoomController(preview);
    const zi = vi.spyOn(c, 'zoomIn');
    setupWheelZoom(preview, c);
    preview.dispatchEvent(wheel(-100, true));
    expect(zi).toHaveBeenCalled();
  });

  it('zoomOut on ctrl+scroll-down', () => {
    const preview = makePreview();
    const c = createZoomController(preview);
    const zo = vi.spyOn(c, 'zoomOut');
    setupWheelZoom(preview, c);
    preview.dispatchEvent(wheel(100, true));
    expect(zo).toHaveBeenCalled();
  });

  it('ignores ctrl+wheel with deltaY === 0 (no direction)', () => {
    const preview = makePreview();
    const c = createZoomController(preview);
    const zi = vi.spyOn(c, 'zoomIn');
    const zo = vi.spyOn(c, 'zoomOut');
    setupWheelZoom(preview, c);
    preview.dispatchEvent(wheel(0, true));
    expect(zi).not.toHaveBeenCalled();
    expect(zo).not.toHaveBeenCalled();
  });
});

describe('updateLevelDisplay', () => {
  it('renders the level as a rounded percentage', () => {
    const el = document.createElement('span');
    updateLevelDisplay(el, 1);
    expect(el.textContent).toBe('100%');
    updateLevelDisplay(el, 0.75);
    expect(el.textContent).toBe('75%');
    updateLevelDisplay(el, 2.5);
    expect(el.textContent).toBe('250%');
  });
});
