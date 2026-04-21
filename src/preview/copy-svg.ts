// Copy the live preview SVG to the clipboard as serialized XML.

import { showToast } from '../ui/toast';

export function setupCopySvg(
  button: HTMLButtonElement | null,
  previewEl: HTMLElement | null
): void {
  if (!button || !previewEl) return;
  button.addEventListener('click', async () => {
    const svg = previewEl.querySelector('svg');
    if (!svg) {
      showToast('No diagram to copy yet.', 'info');
      return;
    }
    const serialized = new XMLSerializer().serializeToString(svg);
    try {
      await navigator.clipboard.writeText(serialized);
      showToast('SVG copied to clipboard', 'success');
    } catch (err) {
      console.warn('Copy failed', err);
      showToast('Could not copy SVG (clipboard blocked)', 'error');
    }
  });
}
