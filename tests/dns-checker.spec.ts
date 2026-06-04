import { test, expect, Page } from '@playwright/test';

/**
 * E2E tests for the Numonic DNS Checker — https://numonic.com/check
 *
 * Coverage:
 *   1. Page loads with the expected form (smoke / happy path)
 *   2. Checking a real domain renders the four result cards (happy path)
 *   3. Deep-link via ?domain= auto-runs a check (happy path)
 *   4. Invalid input with no dot does NOT fire a request (edge case)
 *   5. A malformed-but-dotted domain surfaces a readable error (edge case)
 *
 * The backend the page talks to (used for waitForResponse assertions):
 */
const API = 'staging.api.numonic.com/check';
const CHECK_PATH = '/check';

/** Dismiss/ignore a Vercel bot-challenge if one is served; fail loudly if persistent. */
async function gotoChecker(page: Page, path = CHECK_PATH) {
  const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
  if (res && res.status() === 403) {
    test.skip(true, 'Page returned a Vercel bot-challenge (403). Re-run with --headed.');
  }
  await expect(page.locator('#domainInput')).toBeVisible();
}

test.describe('Numonic DNS Checker', () => {
  test('1. loads the checker form (smoke)', async ({ page }) => {
    await gotoChecker(page);

    await expect(page).toHaveTitle(/DNS Checker/i);
    const input = page.locator('#domainInput');
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute('placeholder', /yourdomain\.com/i);
    await expect(page.locator('#checkBtn')).toBeEnabled();
  });

  test('2. checking a real domain renders DMARC/SPF/DKIM/MX results (happy path)', async ({
    page,
  }) => {
    await gotoChecker(page);

    await page.fill('#domainInput', 'google.com');
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(API), { timeout: 20_000 }),
      page.click('#checkBtn'),
    ]);
    expect(response.status()).toBe(200);

    const results = page.locator('#checkerResults');
    await expect(results).toHaveClass(/visible/);

    // Header summary + exactly 4 progress dots + 4 record cards.
    await expect(page.locator('#hdrStatus')).not.toBeEmpty();
    await expect(page.locator('.progress-dots .dot')).toHaveCount(4);
    await expect(page.locator('#cardsArea .card')).toHaveCount(4);

    // The four authentication mechanisms are all represented on the page.
    for (const label of ['DMARC', 'SPF', 'DKIM', 'MX']) {
      await expect(page.locator('#cardsArea')).toContainText(label);
    }
  });

  test('3. ?domain= URL parameter auto-runs a check (happy path / deep link)', async ({
    page,
  }) => {
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(API), { timeout: 20_000 }),
      gotoChecker(page, `${CHECK_PATH}?domain=gmail.com`),
    ]);
    expect(response.status()).toBe(200);

    await expect(page.locator('#domainInput')).toHaveValue('gmail.com');
    await expect(page.locator('#checkerResults')).toHaveClass(/visible/);
    await expect(page.locator('#cardsArea .card')).toHaveCount(4);
  });

  test('4. input without a dot does not trigger a request (edge case)', async ({ page }) => {
    await gotoChecker(page);

    let requestFired = false;
    page.on('request', (req) => {
      if (req.url().includes(API)) requestFired = true;
    });

    await page.fill('#domainInput', 'localhost'); // no dot -> invalid
    await page.click('#checkBtn');
    await page.waitForTimeout(1500); // give any (incorrect) request time to appear

    expect(requestFired).toBe(false);
    await expect(page.locator('#checkerResults')).not.toHaveClass(/visible/);

    // Documents current UX: no visible error/help is shown for invalid input (see BUG-03).
    await expect(page.locator('#checkerError')).not.toHaveClass(/visible/);
  });

  test('5. malformed-but-dotted domain surfaces a readable error, not a broken state (edge case)', async ({
    page,
  }) => {
    await gotoChecker(page);

    await page.fill('#domainInput', '.'); // passes the weak client check, API rejects it
    await Promise.all([
      page.waitForResponse((r) => r.url().includes(API), { timeout: 20_000 }),
      page.click('#checkBtn'),
    ]);

    // Either a validation error OR a rate-limit message is acceptable; what must NOT
    // happen is a half-rendered results panel.
    const errorBox = page.locator('#checkerError');
    await expect(errorBox).toBeVisible();
    await expect(errorBox).not.toBeEmpty();
    await expect(page.locator('#checkerResults')).not.toHaveClass(/visible/);
  });
});
