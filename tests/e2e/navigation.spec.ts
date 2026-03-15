import { test, expect } from "./fixtures";
import { addMovement, deleteMovement } from "./helpers";

test.describe("Navigation & Settings", () => {
  test("unauthenticated user is redirected to login", async ({ browser }) => {
    // Create a fresh context with NO stored auth — explicitly clear storageState
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();

    await page.goto("/dashboard");
    // The _authenticated layout redirects to "/" when no session cookie is present.
    await expect(page).toHaveURL("/", { timeout: 10000 });
    await context.close();
  });

  test("top nav links navigate correctly", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();

    // Finances link → /finances/movements
    await page.getByRole("link", { name: "Finances" }).click();
    await expect(page).toHaveURL(/\/finances\/movements/);

    // Dashboard link
    await page.getByRole("link", { name: "Dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    // Tools link
    await page.getByRole("link", { name: "Tools" }).click();
    await expect(page).toHaveURL(/\/tools/);

    // Cajita logo → dashboard
    await page.getByRole("link", { name: "Cajita" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("finances sub-nav links navigate correctly", async ({ page }) => {
    await page.goto("/finances/movements");

    // Sub-nav links
    await page.getByRole("link", { name: "Budgets" }).click();
    await expect(page).toHaveURL(/\/finances\/budgets/);
    await expect(
      page.getByRole("heading", { name: "Budgets" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Categories" }).click();
    await expect(page).toHaveURL(/\/finances\/categories/);
    await expect(
      page.getByRole("heading", { name: "Categories" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/finances\/settings/);
    await expect(
      page.getByRole("heading", { name: "Settings" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Movements" }).click();
    await expect(page).toHaveURL(/\/finances\/movements/);
  });

  test("shows logged-in user name", async ({ page }) => {
    await page.goto("/dashboard");
    // Isolated test users are named "Test User <id>"
    await expect(page.getByText(/Test User \w+/).first()).toBeVisible();
    await expect(
      page.getByText(/Welcome back, Test User \w+\./),
    ).toBeVisible();
  });

  test("settings page can toggle date format", async ({ page }) => {
    // Create a movement so there's a date to verify format on
    await page.goto("/finances/movements");
    const name = `DateFmt-${Date.now()}`;
    const row = await addMovement(page, name);

    await page.goto("/finances/settings");
    await expect(
      page.getByRole("heading", { name: "Settings" }),
    ).toBeVisible();

    // Two format buttons visible
    await expect(
      page.getByRole("button", { name: /DD\/MM\/YYYY/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /YYYY-MM-DD/ }),
    ).toBeVisible();

    // Click YYYY-MM-DD format
    await page.getByRole("button", { name: /YYYY-MM-DD/ }).click();

    // Navigate to movements to verify date format applied
    await page.getByRole("link", { name: "Movements" }).click();
    await expect(page).toHaveURL(/\/finances\/movements/);

    // Dates should now show in YYYY-MM-DD format (e.g. 2026-03-14)
    await expect(page.locator("text=/\\d{4}-\\d{2}-\\d{2}/").first()).toBeVisible({
      timeout: 10000,
    });

    // Switch back to DD/MM/YYYY
    await page.goto("/finances/settings");
    await page.getByRole("button", { name: /DD\/MM\/YYYY/ }).click();

    // Verify on movements page
    await page.getByRole("link", { name: "Movements" }).click();
    await expect(page.locator("text=/\\d{2}\\/\\d{2}\\/\\d{4}/").first()).toBeVisible({
      timeout: 10000,
    });

    // Clean up
    await deleteMovement(page, row);
  });
});
