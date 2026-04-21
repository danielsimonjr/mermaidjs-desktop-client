// Reusable show/hide controller for a floating menu anchored to a button.
// Handles: positioning next to the anchor, outside-click dismissal, Escape
// dismissal, and keeps aria-expanded in sync.

export interface DropdownController {
  open(): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
}

export interface DropdownOptions {
  button: HTMLButtonElement;
  menu: HTMLElement;
  /** 'right' = menu appears to the right of the button (default). 'below' = underneath. */
  placement?: 'right' | 'below';
}

export function createDropdown({
  button,
  menu,
  placement = 'right',
}: DropdownOptions): DropdownController {
  let open = false;

  function position(): void {
    const rect = button.getBoundingClientRect();
    if (placement === 'below') {
      menu.style.top = `${rect.bottom + 4}px`;
      menu.style.left = `${rect.left}px`;
    } else {
      menu.style.top = `${rect.top}px`;
      menu.style.left = `${rect.right + 6}px`;
    }
  }

  function setOpen(value: boolean): void {
    if (open === value) return;
    open = value;
    button.setAttribute('aria-expanded', String(value));
    menu.hidden = !value;
    if (value) {
      position();
      document.addEventListener('pointerdown', handlePointerDown, true);
      document.addEventListener('keydown', handleKeydown, true);
      window.addEventListener('resize', position);
    } else {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeydown, true);
      window.removeEventListener('resize', position);
    }
  }

  function handlePointerDown(event: Event): void {
    const target = event.target as Node | null;
    if (!target) return;
    if (menu.contains(target) || button.contains(target)) return;
    setOpen(false);
  }

  function handleKeydown(event: Event): void {
    /* v8 ignore next — defensive; DOM keydown always delivers a KeyboardEvent. */
    if (!(event instanceof KeyboardEvent)) return;
    if (event.key === 'Escape') {
      event.stopPropagation();
      setOpen(false);
      button.focus();
    }
  }

  button.addEventListener('click', (event) => {
    event.preventDefault();
    setOpen(!open);
  });

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!open),
    isOpen: () => open,
  };
}
