import { describe, it, expect, vi } from 'vitest';

import { setupHelpDialog } from '../../src/help/dialog';

describe('setupHelpDialog', () => {
  it('is a no-op when the trigger button is null', () => {
    expect(() => setupHelpDialog(null)).not.toThrow();
  });

  it('creates the dialog on first click and inserts it into the DOM', async () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    // happy-dom lacks HTMLDialogElement.showModal by default.
    HTMLDialogElement.prototype.showModal = vi.fn();
    HTMLDialogElement.prototype.close = vi.fn();

    setupHelpDialog(button);
    button.click();
    await new Promise((r) => setTimeout(r, 0));
    const dialog = document.querySelector('.help-dialog');
    expect(dialog).toBeTruthy();
    expect(dialog?.textContent).toContain('MermaidJS Desktop');
    expect(dialog?.textContent).toContain('v2.4.0');
  });

  it('reuses the dialog on subsequent clicks (does not recreate)', async () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    setupHelpDialog(button);
    button.click();
    await new Promise((r) => setTimeout(r, 0));
    const first = document.querySelector('.help-dialog');
    button.click();
    await new Promise((r) => setTimeout(r, 0));
    const second = document.querySelector('.help-dialog');
    expect(second).toBe(first);
  });

  it('close button closes the dialog', async () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    const close = vi.fn();
    HTMLDialogElement.prototype.close = close;
    setupHelpDialog(button);
    button.click();
    await new Promise((r) => setTimeout(r, 0));
    const closeBtn = document.querySelector<HTMLButtonElement>('.help-dialog-close')!;
    closeBtn.click();
    expect(close).toHaveBeenCalled();
  });

  it('opens external links via window.api.shell.open', async () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    setupHelpDialog(button);
    button.click();
    await new Promise((r) => setTimeout(r, 0));
    const about = document.querySelector<HTMLButtonElement>('.about-button')!;
    about.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(window.api.shell.open).toHaveBeenCalledWith(
      'https://github.com/skydiver/mermaidjs-desktop-client'
    );
  });

  it('F1 opens the dialog', async () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    const show = vi.fn();
    HTMLDialogElement.prototype.showModal = show;
    setupHelpDialog(button);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(show).toHaveBeenCalled();
  });

  it('Ctrl+? opens the dialog', async () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    const show = vi.fn();
    HTMLDialogElement.prototype.showModal = show;
    setupHelpDialog(button);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', ctrlKey: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(show).toHaveBeenCalled();
  });

  it('backdrop click (target === dialog) closes', async () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    const close = vi.fn();
    HTMLDialogElement.prototype.close = close;
    setupHelpDialog(button);
    button.click();
    await new Promise((r) => setTimeout(r, 0));
    const dialog = document.querySelector<HTMLDialogElement>('.help-dialog')!;
    // Dispatch a click whose target is the dialog itself.
    const ev = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(ev, 'target', { value: dialog });
    dialog.dispatchEvent(ev);
    expect(close).toHaveBeenCalled();
  });

  it('about-button without data-url is a no-op', async () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    setupHelpDialog(button);
    button.click();
    await new Promise((r) => setTimeout(r, 0));
    const about = document.querySelector<HTMLButtonElement>('.about-button')!;
    delete about.dataset.url;
    about.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(window.api.shell.open).not.toHaveBeenCalled();
  });
});
