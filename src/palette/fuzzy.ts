// Tiny fuzzy-match scorer for the command palette.
// Returns a non-negative score (higher = better) or null for no match.
// The algorithm: the needle characters must appear in haystack in order;
// contiguous runs and starts-of-words boost the score.

export interface FuzzyResult {
  score: number;
  /** Index positions in `haystack` that matched each needle character. */
  matches: number[];
}

export function fuzzyScore(needle: string, haystack: string): FuzzyResult | null {
  if (!needle) return { score: 0, matches: [] };
  const nLower = needle.toLowerCase();
  const hLower = haystack.toLowerCase();
  const matches: number[] = [];
  let score = 0;
  let lastMatchIndex = -1;
  let runLen = 0;
  let ni = 0;

  for (let hi = 0; hi < hLower.length && ni < nLower.length; hi++) {
    if (hLower[hi] === nLower[ni]) {
      matches.push(hi);
      // Contiguous run bonus — doubles each consecutive hit.
      if (hi === lastMatchIndex + 1) {
        runLen += 1;
        score += 3 + runLen; // 4, 5, 6, ...
      } else {
        runLen = 1;
        score += 1;
      }
      // Start-of-word bonus (haystack char preceded by space/-/_/./, or start).
      if (hi === 0 || /[\s\-_/.]/.test(haystack[hi - 1])) score += 2;
      // Uppercase-match bonus (typing lowercase but haystack has uppercase —
      // implies word boundary in CamelCase).
      if (haystack[hi] !== hLower[hi]) score += 1;
      lastMatchIndex = hi;
      ni += 1;
    }
  }
  if (ni < nLower.length) return null;
  // Prefer shorter matches (less "distance" from first match to last).
  const span = matches[matches.length - 1] - matches[0] + 1;
  score -= Math.max(0, span - nLower.length) * 0.05;
  return { score, matches };
}
