import { describe, it, expect, vi } from 'vitest';

import { CommandRegistry } from '../../src/palette/registry';

function cmd(id: string, run = vi.fn()) {
  return { id, label: id, icon: '', run };
}

describe('CommandRegistry', () => {
  it('register + get + all', () => {
    const r = new CommandRegistry();
    r.register(cmd('a'));
    r.register(cmd('b'));
    expect(r.get('a')?.id).toBe('a');
    expect(r.all()).toHaveLength(2);
  });

  it('registerAll replaces existing ids', () => {
    const r = new CommandRegistry();
    const run1 = vi.fn();
    const run2 = vi.fn();
    r.register(cmd('a', run1));
    r.registerAll([cmd('a', run2), cmd('b')]);
    expect(r.all()).toHaveLength(2);
    void r.execute('a');
    expect(run2).toHaveBeenCalled();
    expect(run1).not.toHaveBeenCalled();
  });

  it('unregister removes a command', () => {
    const r = new CommandRegistry();
    r.register(cmd('a'));
    r.unregister('a');
    expect(r.get('a')).toBeUndefined();
  });

  it('unregister is a no-op for unknown ids (no listener notify)', () => {
    const r = new CommandRegistry();
    const listener = vi.fn();
    r.onChange(listener);
    listener.mockClear();
    r.unregister('missing');
    expect(listener).not.toHaveBeenCalled();
  });

  it('execute runs the command and returns true', async () => {
    const r = new CommandRegistry();
    const run = vi.fn();
    r.register(cmd('a', run));
    expect(await r.execute('a')).toBe(true);
    expect(run).toHaveBeenCalled();
  });

  it('execute returns false for unknown ids', async () => {
    const r = new CommandRegistry();
    expect(await r.execute('nope')).toBe(false);
  });

  it('execute honors isAvailable() === false', async () => {
    const r = new CommandRegistry();
    const run = vi.fn();
    r.register({ ...cmd('a', run), isAvailable: () => false });
    expect(await r.execute('a')).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it('available() filters by isAvailable', () => {
    const r = new CommandRegistry();
    r.register({ ...cmd('a'), isAvailable: () => false });
    r.register({ ...cmd('b'), isAvailable: () => true });
    r.register(cmd('c'));
    const ids = r.available().map((c) => c.id).sort();
    expect(ids).toEqual(['b', 'c']);
  });

  it('onChange fires on register/unregister and unsubscribes cleanly', () => {
    const r = new CommandRegistry();
    const listener = vi.fn();
    const unsubscribe = r.onChange(listener);
    r.register(cmd('a'));
    expect(listener).toHaveBeenCalledTimes(1);
    r.register(cmd('b'));
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    r.register(cmd('c'));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('swallows listener exceptions to keep other listeners alive', () => {
    const r = new CommandRegistry();
    const good = vi.fn();
    r.onChange(() => {
      throw new Error('listener failure');
    });
    r.onChange(good);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    r.register(cmd('a'));
    expect(good).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('awaits async run() before resolving execute()', async () => {
    const r = new CommandRegistry();
    let resolved = false;
    r.register({
      ...cmd('a'),
      run: async () => {
        await new Promise((r) => setTimeout(r, 5));
        resolved = true;
      },
    });
    await r.execute('a');
    expect(resolved).toBe(true);
  });
});
