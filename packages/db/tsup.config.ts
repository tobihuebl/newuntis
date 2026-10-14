import { defineConfig } from 'tsup';

// Im Watch-Modus (pnpm dev) dist nicht leeren: sonst sieht die parallel startende API kurz keine Typen
export default defineConfig((options) => ({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: !options.watch,
  sourcemap: true,
  external: ['@prisma/client'],
}));
