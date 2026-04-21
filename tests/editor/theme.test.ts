import { describe, it, expect } from 'vitest';

import { createEditorTheme } from '../../src/editor/theme';

describe('createEditorTheme', () => {
  it('returns a truthy CodeMirror Extension', () => {
    const ext = createEditorTheme();
    expect(ext).toBeTruthy();
  });

  it('produces a new extension instance each call (no cached state)', () => {
    const a = createEditorTheme();
    const b = createEditorTheme();
    expect(a).not.toBe(b);
  });
});
