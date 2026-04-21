import { describe, it, expect, vi, beforeEach } from 'vitest';

import { setupToolbarShortcuts } from '../../src/toolbar/shortcuts';

function makeButton() {
  const b = document.createElement('button');
  b.addEventListener('click', vi.fn());
  return b;
}

// The shortcuts module reads navigator.platform + userAgentData at setup time.
// Force a non-Mac default so Ctrl is the modifier; individual tests override.
beforeEach(() => {
  Object.defineProperty(navigator, 'platform', {
    configurable: true,
    value: 'Win32',
  });
  Object.defineProperty(navigator, 'userAgentData', {
    configurable: true,
    value: undefined,
  });
});

describe('setupToolbarShortcuts', () => {
  it('fires save on Ctrl+S (non-mac)', () => {
    const saveButton = makeButton();
    const clicked = vi.fn();
    saveButton.addEventListener('click', clicked);
    setupToolbarShortcuts({ saveButton });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }));
    expect(clicked).toHaveBeenCalled();
  });

  it('fires open on Ctrl+O', () => {
    const openButton = makeButton();
    const clicked = vi.fn();
    openButton.addEventListener('click', clicked);
    setupToolbarShortcuts({ openButton });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', ctrlKey: true }));
    expect(clicked).toHaveBeenCalled();
  });

  it('fires new on Ctrl+N', () => {
    const newButton = makeButton();
    const clicked = vi.fn();
    newButton.addEventListener('click', clicked);
    setupToolbarShortcuts({ newButton });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true }));
    expect(clicked).toHaveBeenCalled();
  });

  it('ignores events with Alt pressed (e.g. Alt+Ctrl+S)', () => {
    const saveButton = makeButton();
    const clicked = vi.fn();
    saveButton.addEventListener('click', clicked);
    setupToolbarShortcuts({ saveButton });
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 's', ctrlKey: true, altKey: true })
    );
    expect(clicked).not.toHaveBeenCalled();
  });

  it('ignores repeat events', () => {
    const saveButton = makeButton();
    const clicked = vi.fn();
    saveButton.addEventListener('click', clicked);
    setupToolbarShortcuts({ saveButton });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, repeat: true }));
    expect(clicked).not.toHaveBeenCalled();
  });

  it('does nothing without modifier', () => {
    const saveButton = makeButton();
    const clicked = vi.fn();
    saveButton.addEventListener('click', clicked);
    setupToolbarShortcuts({ saveButton });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }));
    expect(clicked).not.toHaveBeenCalled();
  });

  it('does not click disabled buttons', () => {
    const saveButton = makeButton();
    saveButton.disabled = true;
    const clicked = vi.fn();
    saveButton.addEventListener('click', clicked);
    setupToolbarShortcuts({ saveButton });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }));
    expect(clicked).not.toHaveBeenCalled();
  });

  it('tolerates missing buttons', () => {
    setupToolbarShortcuts({});
    expect(() =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }))
    ).not.toThrow();
  });

  it('returns an unbind function that stops responding', () => {
    const saveButton = makeButton();
    const clicked = vi.fn();
    saveButton.addEventListener('click', clicked);
    const unbind = setupToolbarShortcuts({ saveButton });
    unbind();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }));
    expect(clicked).not.toHaveBeenCalled();
  });

  it('uses Meta as modifier on Mac (userAgentData.platform)', () => {
    Object.defineProperty(navigator, 'userAgentData', {
      configurable: true,
      value: { platform: 'macOS' },
    });
    const saveButton = makeButton();
    const clicked = vi.fn();
    saveButton.addEventListener('click', clicked);
    setupToolbarShortcuts({ saveButton });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', metaKey: true }));
    expect(clicked).toHaveBeenCalled();
  });

  it('respects event.defaultPrevented', () => {
    const saveButton = makeButton();
    const clicked = vi.fn();
    saveButton.addEventListener('click', clicked);
    setupToolbarShortcuts({ saveButton });
    const ev = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true });
    ev.preventDefault();
    window.dispatchEvent(ev);
    expect(clicked).not.toHaveBeenCalled();
  });
});
