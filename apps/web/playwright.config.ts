import { defineConfig, devices } from '@playwright/test';

/**
 * Config E2E de la vista de Tácticas V2. Arranca el dev server de Vite (:5173)
 * y ejecuta Chromium con traza para auditar la pizarra dual (FC / PES 6).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/html-report' }]],
  outputDir: 'e2e/test-results',
  use: {
    baseURL: 'http://localhost:5273',
    actionTimeout: 15_000,
    trace: 'on',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } }],
  webServer: {
    command: 'npx vite --port 5273 --strictPort',
    url: 'http://localhost:5273',
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
