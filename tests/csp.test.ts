// Asserts the renderer's <meta http-equiv="Content-Security-Policy"> in
// src/index.html declares the full set of directives we rely on. This is a
// pure-string check rather than a runtime assertion because Vite serves the
// HTML literally — what's in the file is what the renderer gets.

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REQUIRED_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
];

describe('renderer CSP meta tag', () => {
  it('declares all 11 required directives', async () => {
    const html = await fs.readFile(join(__dirname, '..', 'src', 'index.html'), 'utf8');
    // CSP attribute values contain single quotes (e.g. 'self'), so the outer
    // delimiter is always a double quote in this file. Grab everything
    // between the first content=" and the closing ".
    const match = html.match(
      /<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]+content="([^"]+)"/i
    );
    expect(match, 'CSP meta tag missing').not.toBeNull();
    const csp = match![1]!;
    for (const directive of REQUIRED_DIRECTIVES) {
      expect(csp, `CSP must contain: ${directive}`).toContain(directive);
    }
  });
});
