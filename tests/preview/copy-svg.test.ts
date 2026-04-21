import { describe, it, expect, vi, beforeEach } from 'vitest';

import { setupCopySvg } from '../../src/preview/copy-svg';

function makeSetup(includeSvg: boolean) {
  const button = document.createElement('button');
  const preview = document.createElement('div');
  if (includeSvg) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100');
    preview.append(svg);
  }
  document.body.append(button, preview);
  return { button, preview };
}

beforeEach(() => {
  // happy-dom doesn't have navigator.clipboard by default.
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(async () => {}) },
  });
});

describe('setupCopySvg', () => {
  it('is a no-op when button is null', () => {
    const { preview } = makeSetup(true);
    expect(() => setupCopySvg(null, preview)).not.toThrow();
  });

  it('is a no-op when previewEl is null', () => {
    const { button } = makeSetup(true);
    expect(() => setupCopySvg(button, null)).not.toThrow();
  });

  it('shows a toast when no SVG is present', async () => {
    const { button, preview } = makeSetup(false);
    setupCopySvg(button, preview);
    button.click();
    await new Promise((r) => setTimeout(r, 0));
    const toast = document.querySelector('.toast');
    expect(toast?.textContent).toMatch(/No diagram to copy/i);
  });

  it('serializes the SVG and writes to clipboard on success', async () => {
    const { button, preview } = makeSetup(true);
    setupCopySvg(button, preview);
    button.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
    const calledWith = vi.mocked(navigator.clipboard.writeText).mock.calls[0]?.[0];
    expect(calledWith).toContain('<svg');
  });

  it('shows a success toast after copy', async () => {
    const { button, preview } = makeSetup(true);
    setupCopySvg(button, preview);
    button.click();
    await new Promise((r) => setTimeout(r, 0));
    const toast = document.querySelector('.toast');
    expect(toast?.textContent).toMatch(/copied/i);
    expect(toast?.getAttribute('data-toast-level')).toBe('success');
  });

  it('shows an error toast on clipboard rejection', async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('permission denied'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { button, preview } = makeSetup(true);
    setupCopySvg(button, preview);
    button.click();
    await new Promise((r) => setTimeout(r, 0));
    const toast = document.querySelector('.toast');
    expect(toast?.getAttribute('data-toast-level')).toBe('error');
    warn.mockRestore();
  });
});
