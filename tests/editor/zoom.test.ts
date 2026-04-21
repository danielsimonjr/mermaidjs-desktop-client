import { describe, it, expect, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import {
  createEditorZoomExtension,
  createEditorZoomController,
  createEditorZoomKeymap,
} from '../../src/editor/zoom';

function makeView() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const view = new EditorView({
    parent: host,
    state: EditorState.create({ doc: 'hello', extensions: [] }),
  });
  return { view, host };
}

describe('createEditorZoomExtension', () => {
  it('exposes extension + compartment', () => {
    const { extension, compartment } = createEditorZoomExtension();
    expect(extension).toBeTruthy();
    expect(compartment).toBeTruthy();
  });
});

describe('createEditorZoomController', () => {
  it('starts at level 1 and zooms in with clamp at MAX (3)', () => {
    const { view } = makeView();
    const { compartment } = createEditorZoomExtension();
    const onChange = vi.fn();
    const c = createEditorZoomController(view, compartment, onChange);

    expect(c.getLevel()).toBe(1);
    for (let i = 0; i < 25; i++) c.zoomIn(); // way past the ceiling
    expect(c.getLevel()).toBe(3);
    expect(onChange).toHaveBeenLastCalledWith(3);
  });

  it('zooms out and clamps at MIN (0.5)', () => {
    const { view } = makeView();
    const { compartment } = createEditorZoomExtension();
    const c = createEditorZoomController(view, compartment);
    for (let i = 0; i < 25; i++) c.zoomOut();
    expect(c.getLevel()).toBe(0.5);
  });

  it('reset() returns to 1', () => {
    const { view } = makeView();
    const { compartment } = createEditorZoomExtension();
    const c = createEditorZoomController(view, compartment);
    c.zoomIn();
    c.zoomIn();
    expect(c.getLevel()).not.toBe(1);
    c.reset();
    expect(c.getLevel()).toBe(1);
  });

  it('accepts an initialLevel and applies it on construction', () => {
    const { view } = makeView();
    const { compartment } = createEditorZoomExtension();
    const c = createEditorZoomController(view, compartment, undefined, 1.5);
    expect(c.getLevel()).toBe(1.5);
  });

  it('initialLevel === default (1) does NOT dispatch reconfigure', () => {
    const { view } = makeView();
    const { compartment } = createEditorZoomExtension();
    const dispatch = vi.spyOn(view, 'dispatch');
    createEditorZoomController(view, compartment, undefined, 1);
    // No reconfigure at construction when level matches default.
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('invokes onZoomChange on each applied zoom', () => {
    const { view } = makeView();
    const { compartment } = createEditorZoomExtension();
    const onChange = vi.fn();
    const c = createEditorZoomController(view, compartment, onChange);
    c.zoomIn();
    c.zoomOut();
    c.reset();
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it('zoomIn/zoomOut are no-ops (but still return true) when already at boundary', () => {
    const { view } = makeView();
    const { compartment } = createEditorZoomExtension();
    const onChange = vi.fn();
    const c = createEditorZoomController(view, compartment, onChange, 3);
    onChange.mockClear();
    // At max, zoomIn should not call onChange.
    expect(c.zoomIn()).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('createEditorZoomKeymap', () => {
  it('returns a CodeMirror Extension', () => {
    const { view } = makeView();
    const { compartment } = createEditorZoomExtension();
    const c = createEditorZoomController(view, compartment);
    const ext = createEditorZoomKeymap(c);
    expect(ext).toBeTruthy();
  });

  it('binds Mod-=, Mod-+, Mod--, Mod-0 to zoom actions', () => {
    const { view } = makeView();
    const { compartment } = createEditorZoomExtension();
    const controller = createEditorZoomController(view, compartment);
    const zoomIn = vi.spyOn(controller, 'zoomIn');
    const zoomOut = vi.spyOn(controller, 'zoomOut');
    const reset = vi.spyOn(controller, 'reset');

    // Invoke each binding's run() handler directly via the keymap extension's
    // internal `value` array — that's the cleanest way to exercise the bodies
    // without building a full DOM+CodeMirror input pipeline.
    const ext = createEditorZoomKeymap(controller) as unknown as {
      value: Array<{ key: string; run: () => boolean }>;
    };
    const bindings = ext.value;
    expect(bindings.length).toBeGreaterThan(0);
    for (const b of bindings) b.run();
    expect(zoomIn).toHaveBeenCalled();
    expect(zoomOut).toHaveBeenCalled();
    expect(reset).toHaveBeenCalled();
  });
});
