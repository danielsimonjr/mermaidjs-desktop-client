import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

// Stub mermaid BEFORE importing export-diagram.
vi.mock('mermaid', () => ({
  default: {
    render: vi.fn(async (_id: string, _src: string, container: HTMLElement) => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      Object.defineProperty(svg, 'getBBox', {
        value: () => ({ x: 0, y: 0, width: 100, height: 100 }),
      });
      container.appendChild(svg);
      return { svg: '<svg><g></g></svg>' };
    }),
  },
}));

import { createExportHandler } from '../../src/toolbar/export-diagram';

function makeEditor(doc = 'graph TD\nA-->B') {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return new EditorView({
    parent: host,
    state: EditorState.create({ doc, extensions: [] }),
  });
}

/**
 * Tests that exercise the PNG pipeline: happy-dom lacks canvas.toBlob,
 * OffscreenCanvas, and Image.decode — we stub just enough to let the
 * rendering code succeed end-to-end.
 */

beforeEach(() => {
  // Fake canvas that returns a minimal 2d context + a toBlob that yields an empty PNG Blob.
  const fakeContext = {
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    // tracked state used by export-diagram
    globalAlpha: 1,
    fillStyle: '#ffffff',
  } as unknown as CanvasRenderingContext2D;

  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic
  const fakeBlob = {
    arrayBuffer: vi.fn(async () => pngBytes.buffer),
  } as unknown as Blob;

  const originalCreate = document.createElement.bind(document);
  // Typed loosely because document.createElement has many overload variants
  // (including Electron's WebviewTag) that we don't need here.
  const spy = vi.spyOn(document, 'createElement') as unknown as {
    mockImplementation: (impl: (tag: string) => HTMLElement) => void;
  };
  spy.mockImplementation((tag: string) => {
    if (tag === 'canvas') {
      const canvas = originalCreate('canvas') as HTMLCanvasElement;
      canvas.getContext = vi.fn(() => fakeContext) as unknown as HTMLCanvasElement['getContext'];
      canvas.toBlob = vi.fn((cb: BlobCallback) => cb(fakeBlob));
      return canvas;
    }
    return originalCreate(tag);
  });

  // happy-dom's Image doesn't fire onload in a meaningful way — substitute one.
  class FakeImage {
    crossOrigin = '';
    naturalWidth = 100;
    naturalHeight = 100;
    width = 100;
    height = 100;
    onload: (() => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    set src(_v: string) {
      // Fire onload on the next microtask so the export code's await can observe it.
      queueMicrotask(() => this.onload?.());
    }
    async decode(): Promise<void> {}
  }
  (globalThis as unknown as { Image: typeof FakeImage }).Image = FakeImage;
});

describe('export-diagram — PNG pipeline', () => {
  it('exports PNG 1x and writes bytes through window.api.fs.writeFile', async () => {
    const editor = makeEditor();
    vi.mocked(window.api.dialog.showSaveDialog).mockResolvedValueOnce('/out/diagram.png');
    const handler = createExportHandler({ editor, getPath: () => null });
    await handler('png');
    expect(window.api.fs.writeFile).toHaveBeenCalledWith(
      '/out/diagram.png',
      expect.any(Uint8Array)
    );
  });

  it('exports PNG 2x (applies @2x suffix, calls writeFile once)', async () => {
    const editor = makeEditor();
    vi.mocked(window.api.dialog.showSaveDialog).mockResolvedValueOnce('/out/diagram@2x.png');
    const handler = createExportHandler({ editor, getPath: () => null });
    await handler('pngx2');
    expect(window.api.fs.writeFile).toHaveBeenCalledTimes(1);
  });

  it('falls through decode() failure without crashing', async () => {
    class ThrowingImage {
      onload: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      naturalWidth = 100;
      naturalHeight = 100;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
      async decode(): Promise<void> {
        throw new Error('decode blew up');
      }
    }
    (globalThis as unknown as { Image: typeof ThrowingImage }).Image = ThrowingImage;

    const editor = makeEditor();
    vi.mocked(window.api.dialog.showSaveDialog).mockResolvedValueOnce('/out/diagram.png');
    const handler = createExportHandler({ editor, getPath: () => null });
    // Decode errors are silently swallowed per the module's comment.
    await expect(handler('png')).resolves.toBeUndefined();
    expect(window.api.fs.writeFile).toHaveBeenCalled();
  });

  it('image onerror rejects and the export logs the error', async () => {
    class ErroringImage {
      onload: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onerror?.(new Error('bad data url')));
      }
    }
    (globalThis as unknown as { Image: typeof ErroringImage }).Image = ErroringImage;

    const editor = makeEditor();
    vi.mocked(window.api.dialog.showSaveDialog).mockResolvedValueOnce('/out/diagram.png');
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = createExportHandler({ editor, getPath: () => null });
    await handler('png');
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('throws when canvas.getContext returns null (happens on exotic platforms)', async () => {
    // Use the real Document prototype method to bypass the outer beforeEach spy.
    const realCreate = Document.prototype.createElement.bind(document);
    (document.createElement as unknown as { mockImplementation: (impl: (tag: string) => HTMLElement) => void }).mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'canvas') {
        (el as HTMLCanvasElement).getContext = vi.fn(
          () => null
        ) as unknown as HTMLCanvasElement["getContext"];
      }
      return el;
    });

    const editor = makeEditor();
    vi.mocked(window.api.dialog.showSaveDialog).mockResolvedValueOnce('/out/diagram.png');
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = createExportHandler({ editor, getPath: () => null });
    await handler('png');
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('throws when canvas.toBlob yields null (logged, not crashed)', async () => {
    const realCreate = Document.prototype.createElement.bind(document);
    (document.createElement as unknown as { mockImplementation: (impl: (tag: string) => HTMLElement) => void }).mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'canvas') {
        (el as HTMLCanvasElement).getContext = vi.fn(
          () =>
            ({
              save: vi.fn(),
              restore: vi.fn(),
              fillRect: vi.fn(),
              drawImage: vi.fn(),
              globalAlpha: 1,
              fillStyle: '#ffffff',
            }) as unknown as CanvasRenderingContext2D
        ) as unknown as HTMLCanvasElement["getContext"];
        (el as HTMLCanvasElement).toBlob = vi.fn((cb: BlobCallback) => cb(null));
      }
      return el;
    });

    const editor = makeEditor();
    vi.mocked(window.api.dialog.showSaveDialog).mockResolvedValueOnce('/out/diagram.png');
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = createExportHandler({ editor, getPath: () => null });
    await handler('png');
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
