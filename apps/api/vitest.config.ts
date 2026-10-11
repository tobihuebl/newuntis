import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // SWC liefert die Decorator-Metadaten, die NestJS für Dependency Injection braucht.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: true,
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    globalSetup: ['./test/support/global-setup.ts'],
    setupFiles: ['./test/support/env.ts'],
    env: { NODE_ENV: 'test' },
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
