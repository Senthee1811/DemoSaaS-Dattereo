import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: {
    environment: 'jsdom',
    // Each worker runs a jsdom + React app. At the default (one per core) the suite oversubscribes the CPU and tests that take 1.5 s
    // alone take 5-6 s, intermittently crossing the 5 s timeout. Four workers: same wall-clock, half the cumulative test time, no flakes.
    maxWorkers: 4,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', '.next/**'],
  },
});
