import { defineConfig } from 'vitest/config';

// Unit-Tests der Web-App; die Playwright-Tests in e2e/ laufen getrennt (pnpm e2e).
export default defineConfig({
  test: { include: ['src/**/*.test.{ts,tsx}'] },
});
