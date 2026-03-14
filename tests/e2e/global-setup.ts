import { test as setup, expect } from "@playwright/test";

const authFile = "tests/e2e/.auth/session.json";

setup("authenticate via dev-login", async ({ page }) => {
  // Hit the dev-login endpoint — it creates a session and redirects to /dashboard
  await page.goto("/api/auth/dev-login");

  // Wait for the redirect to complete
  await expect(page).toHaveURL(/.*dashboard/);

  // Save the authenticated session state for all tests to reuse
  await page.context().storageState({ path: authFile });
});
