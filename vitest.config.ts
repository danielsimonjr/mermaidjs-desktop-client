import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: false, // always import { describe, it, expect } explicitly
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    // Unit tests must not leak timers / fake dates between tests.
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.ts', 'electron/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/main.ts', // bootstrap — tested via integration, not units
        'src/index.html',
        'electron/types.ts', // types + const object, no runtime logic
        'src/examples/**',
      ],
      // Fail CI if coverage drops below these numbers.
      // Branches is slightly lower because a few genuinely-unreachable defensive
      // fallbacks (e.g. example-sort tiebreaker on unique-numbered filenames)
      // don't have test paths that can exercise them.
      thresholds: {
        statements: 95,
        branches: 88,
        functions: 95,
        lines: 95,
      },
    },
  },
});
