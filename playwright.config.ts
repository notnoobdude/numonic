import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the Numonic DNS Checker test suite.
 *
 * NOTE: the page sometimes serves a Vercel bot-challenge (HTTP 403,
 * `x-vercel-mitigated: challenge`) to automated/headless clients. Running
 * `--headed` is the most reliable way to get past it. See README.md.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // serialise to be gentle with the API rate limit
  workers: 1,
  retries: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'https://numonic.com',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // A real UA reduces (does not guarantee) bot-challenge interstitials.
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
