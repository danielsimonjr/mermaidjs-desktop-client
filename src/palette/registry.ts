// Command registry — single source of truth for every user-executable action.
// Consumers (command palette, activity bar, keyboard shortcuts, future menus)
// all read from the registry so the UIs can't drift from behavior.

export interface Command {
  id: string;
  /** Human-readable label shown in palette + tooltips. */
  label: string;
  /** RemixIcon class name (without the leading `ri-`). Empty string = no icon. */
  icon: string;
  /** Optional keybinding hint shown in palette, e.g. ['Ctrl', 'K']. */
  keybinding?: string[];
  /** Category label; shown as a header in the palette. */
  category?: 'File' | 'View' | 'Export' | 'Theme' | 'Help';
  /** Execute the command. Async results are awaited by the palette. */
  run: () => void | Promise<void>;
  /** Return false to hide from the palette (e.g. no document loaded). */
  isAvailable?: () => boolean;
}

export class CommandRegistry {
  private readonly commands = new Map<string, Command>();
  private readonly listeners = new Set<() => void>();

  register(command: Command): void {
    this.commands.set(command.id, command);
    this.notify();
  }

  registerAll(commands: Command[]): void {
    for (const c of commands) this.commands.set(c.id, c);
    this.notify();
  }

  unregister(id: string): void {
    if (this.commands.delete(id)) this.notify();
  }

  get(id: string): Command | undefined {
    return this.commands.get(id);
  }

  all(): Command[] {
    return [...this.commands.values()];
  }

  available(): Command[] {
    return this.all().filter((c) => c.isAvailable?.() !== false);
  }

  /** Run a command by id; returns true if the id was known. */
  async execute(id: string): Promise<boolean> {
    const cmd = this.commands.get(id);
    if (!cmd) return false;
    if (cmd.isAvailable?.() === false) return false;
    await cmd.run();
    return true;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const l of this.listeners) {
      try {
        l();
      } catch (err) {
        console.warn('CommandRegistry listener threw', err);
      }
    }
  }
}

export const globalRegistry = new CommandRegistry();
