import { test as base, type BrowserContext } from "@playwright/test";

/**
 * Custom test fixture that gives each test its own isolated team.
 *
 * How it works:
 * - Before each test, hit `/api/auth/dev-login?isolated=true` which creates
 *   a unique user + team in the database.
 * - The session cookie is set on the browser context so all API calls and
 *   ElectricSQL syncs are scoped to that team.
 * - Tests see a completely empty team — no movements, categories, or budgets
 *   from other tests or the real data.
 */
export const test = base.extend({
  page: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Authenticate with an isolated team
    await page.goto("/api/auth/dev-login?isolated=true");
    await page.waitForURL(/.*dashboard/);

    await use(page);

    await context.close();
  },
});

/**
 * Authenticate an existing browser context with an isolated team.
 * Use this in serial test suites where multiple tests share state:
 *
 *   let context: BrowserContext;
 *   let page: Page;
 *   test.beforeAll(async ({ browser }) => {
 *     ({ context, page } = await loginIsolated(browser));
 *   });
 *   test.afterAll(async () => { await context.close(); });
 */
export async function loginIsolated(browser: { newContext: () => Promise<BrowserContext> }) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/api/auth/dev-login?isolated=true");
  await page.waitForURL(/.*dashboard/);
  return { context, page };
}

export { expect } from "@playwright/test";
