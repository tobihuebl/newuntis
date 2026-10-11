import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // SWC liefert die Decorator-Metadaten, die NestJS für Dependency Injection braucht.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: { globals: true, include: ['test/**/*.test.ts', 'src/**/*.test.ts'] },
});
