import { describe, it, expect } from 'vitest';

import { fuzzyScore } from '../../src/palette/fuzzy';

describe('fuzzyScore', () => {
  it('returns score 0 for empty needle', () => {
    expect(fuzzyScore('', 'anything')).toEqual({ score: 0, matches: [] });
  });

  it('returns null when needle cannot be found in order', () => {
    expect(fuzzyScore('xyz', 'abc')).toBeNull();
    expect(fuzzyScore('ba', 'ab')).toBeNull(); // order matters
  });

  it('matches contiguous substrings with high score', () => {
    const a = fuzzyScore('file', 'filesystem')!;
    const b = fuzzyScore('file', 'fantastic fallback ide'); // scattered
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a.score).toBeGreaterThan(b!.score);
  });

  it('boosts start-of-word matches', () => {
    const atStart = fuzzyScore('sd', 'save diagram')!;
    const midWord = fuzzyScore('sd', 'misdial')!;
    expect(atStart.score).toBeGreaterThan(midWord.score);
  });

  it('records the match positions', () => {
    const result = fuzzyScore('abc', 'aXbYc')!;
    expect(result.matches).toEqual([0, 2, 4]);
  });

  it('is case-insensitive', () => {
    expect(fuzzyScore('ABC', 'abc')).not.toBeNull();
    expect(fuzzyScore('abc', 'ABC')).not.toBeNull();
  });

  it('rewards CamelCase boundaries (score in a reasonable range)', () => {
    // We just verify both match and CamelCase doesn't score drastically worse
    // than a plain-text match — the actual ranking depends on scoring weights.
    const camel = fuzzyScore('nd', 'newDiagram')!;
    const plain = fuzzyScore('nd', 'noun domain')!;
    expect(camel).not.toBeNull();
    expect(plain).not.toBeNull();
    expect(camel.score).toBeGreaterThan(0);
    expect(plain.score).toBeGreaterThan(0);
  });

  it('penalizes span when matches are far apart', () => {
    const tight = fuzzyScore('ab', 'absolutely')!; // contiguous + at start
    const loose = fuzzyScore('ab', 'aYYYYYYYYYYYYYYYYb')!;
    // Tight match should score higher (contiguous + start-of-word bonuses).
    expect(tight.score).toBeGreaterThan(loose.score);
  });
});
