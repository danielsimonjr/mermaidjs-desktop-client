import { describe, it, expect, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

// Mock mermaid before importing export-diagram.
vi.mock('mermaid', () => ({
  default: {
    render: vi.fn(async (_id: string, _src: string, container: HTMLElement) => {
      // Build an SVG in the sandbox so normalizeSvg() finds something.
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '100');
      svg.setAttribute('height', '100');
      // happy-dom doesn't implement getBBox; provide a fake on the element.
      Object.defineProperty(svg, 'getBBox', {
        value: () => ({ x: 0, y: 0, width: 100, height: 100 }),
      });
      container.appendChild(svg);
      return { svg: '<svg><g></g></svg>' };
    }),
  },
}));

import { createExportHandler } from '../../src/toolbar/export-diagram';

function makeEditor(doc = 'graph TD\n A-->B') {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return new EditorView({
    parent: host,
    state: EditorState.create({ doc, extensions: [] }),
  });
}

describe('createExportHandler', () => {
  it('warns and returns early on empty document', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const editor = makeEditor('   ');
    const handler = createExportHandler({ editor, getPath: () => null });
    await handler('svg');
    expect(warn).toHaveBeenCalledWith('Cannot export an empty diagram.');
    expect(window.api.dialog.showSaveDialog).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('SVG export: prompts, writes, uses "diagram" base when no current path', async () => {
    const editor = makeEditor();
    vi.mocked(window.api.dialog.showSaveDialog).mockResolvedValueOnce('/out/diagram.svg');
    const handler = createExportHandler({ editor, getPath: () => null });
    await handler('svg');
    expect(window.api.dialog.showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: 'diagram.svg' })
    );
    expect(window.api.fs.writeTextFile).toHaveBeenCalledWith(
      '/out/diagram.svg',
      expect.stringContaining('<svg')
    );
  });

  it('SVG export: derives base name from existing path (strips extension)', async () => {
    const editor = makeEditor();
    vi.mocked(window.api.dialog.showSaveDialog).mockResolvedValueOnce('/out/my.svg');
    const handler = createExportHandler({ editor, getPath: () => 'C:/foo/MyChart.mmd' });
    await handler('svg');
    expect(window.api.dialog.showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: 'MyChart.svg' })
    );
  });

  it('SVG export: user cancel → no write', async () => {
    const editor = makeEditor();
    vi.mocked(window.api.dialog.showSaveDialog).mockResolvedValueOnce(null);
    const handler = createExportHandler({ editor, getPath: () => null });
    await handler('svg');
    expect(window.api.fs.writeTextFile).not.toHaveBeenCalled();
  });

  it('PNG export: cancel from save dialog aborts without write', async () => {
    // Stub out canvas for happy-dom.
    const editor = makeEditor();
    vi.mocked(window.api.dialog.showSaveDialog).mockResolvedValueOnce(null);
    const handler = createExportHandler({ editor, getPath: () => null });
    await handler('png');
    expect(window.api.fs.writeFile).not.toHaveBeenCalled();
  });

  it('PNG @2x export: uses the @2x suffix in default filename', async () => {
    const editor = makeEditor();
    vi.mocked(window.api.dialog.showSaveDialog).mockResolvedValueOnce(null);
    const handler = createExportHandler({ editor, getPath: () => null });
    await handler('pngx2');
    expect(window.api.dialog.showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: 'diagram@2x.png' })
    );
  });

  it('logs on render failure', async () => {
    // Make mermaid throw.
    const mermaid = (await import('mermaid')).default;
    vi.mocked(mermaid.render).mockRejectedValueOnce(new Error('render blew up'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const editor = makeEditor();
    const handler = createExportHandler({ editor, getPath: () => null });
    await handler('svg');
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('inferBaseName: path without extension keeps full segment', async () => {
    const editor = makeEditor();
    vi.mocked(window.api.dialog.showSaveDialog).mockResolvedValueOnce(null);
    const handler = createExportHandler({ editor, getPath: () => '/out/README' });
    await handler('svg');
    expect(window.api.dialog.showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: 'README.svg' })
    );
  });

  it('inferBaseName: pure whitespace path falls back to "diagram"', async () => {
    const editor = makeEditor();
    vi.mocked(window.api.dialog.showSaveDialog).mockResolvedValueOnce(null);
    const handler = createExportHandler({ editor, getPath: () => '   ' });
    await handler('svg');
    expect(window.api.dialog.showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: 'diagram.svg' })
    );
  });
});
