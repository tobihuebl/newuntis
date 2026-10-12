import { defineConfig, devices } from '@playwright/test';

/** End-to-End-Tests (Spec Abschnitt 13). Start: pnpm e2e (Docker muss laufen). */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    // Mandant über die Subdomain; *.localhost zeigt in Chromium auf 127.0.0.1
    baseURL: 'http://demo.localhost:3100',
    locale: 'de-AT',
    timezoneId: 'Europe/Vienna',
    trace: 'retain-on-failure',
    serviceWorkers: 'allow',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
