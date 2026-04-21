// Tiny ephemeral toast — creates a div, animates in, removes itself after a
// timeout. Replaces any existing toast so rapid calls don't stack.

export type ToastLevel = 'success' | 'error' | 'info';

export function showToast(message: string, level: ToastLevel = 'info', durationMs = 2000): void {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.dataset.toastLevel = level;
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.append(el);
  window.setTimeout(() => {
    el.remove();
  }, durationMs);
}
