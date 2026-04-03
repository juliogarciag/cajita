import { expect, loginIsolated } from "./fixtures";
import { test, type Page, type BrowserContext } from "@playwright/test";

// Deep link tests build on shared state and must run serially
test.describe.configure({ mode: "serial" });

const UNIQUE = Date.now();
const BUDGET_NAME = `DeepLink-${UNIQUE}`;
const ITEM_DESC = `DLItem-${UNIQUE}`;

test.describe("Deep linking between movements and budget items", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ({ context, page } = await loginIsolated(browser));
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("setup: create budget with a synced item", async () => {
    // Create a budget
    await page.goto("/finances/budgets");
    await page.getByRole("button", { name: "Add Budget" }).click();
    await page.getByRole("textbox", { name: "Budget name" }).fill(BUDGET_NAME);
    await page.getByPlaceholder("500.00").fill("1000");
    await page.getByRole("button", { name: "Blue" }).click();
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText(BUDGET_NAME)).toBeVisible({ timeout: 10000 });

    // Navigate to budget detail
    await page.getByText(BUDGET_NAME, { exact: true }).click({ force: true });
    await expect(
      page.getByRole("heading", { name: BUDGET_NAME }),
    ).toBeVisible({ timeout: 10000 });

    // Add a budget item
    await page.getByRole("button", { name: "Add Item" }).click();
    await expect(page.getByText("New Item")).toBeVisible();
    await page.getByRole("textbox").first().fill(ITEM_DESC);
    await page.getByPlaceholder("55.42").fill("200");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText(ITEM_DESC)).toBeVisible({ timeout: 10000 });

    // Set accounting date (required for sync)
    const pendingDateCells = page
      .locator("[data-editable-cell]")
      .filter({ hasText: "—" });
    await pendingDateCells.last().click();
    await page.getByRole("button", { name: /^Today,/ }).click();

    // Sync the item to create a linked movement
    const syncBtn = page.getByRole("button", { name: "Sync" });
    await expect(syncBtn).toBeEnabled({ timeout: 5000 });
    await syncBtn.click();
    await expect(page.getByText("Synced")).toBeVisible({ timeout: 10000 });
  });

  test("'View in movements' link from budget item scrolls to and highlights the movement", async () => {
    // Navigate to the budget detail
    await page.goto("/finances/budgets");
    await page.getByText(BUDGET_NAME, { exact: true }).click({ force: true });
    await expect(
      page.getByRole("heading", { name: BUDGET_NAME }),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Synced")).toBeVisible({ timeout: 10000 });

    // Click the "View in movements" link on the synced budget item
    await page.getByRole("link", { name: "View in movements" }).click();

    // URL must contain the highlight param pointing to the movement
    await expect(page).toHaveURL(/\/finances\/movements\?highlight=/, {
      timeout: 10000,
    });

    // The highlighted movement row should have the blue highlight class
    await expect(page.locator(".bg-blue-100").first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("'View budget' link from movement scrolls to and highlights the budget item", async () => {
    // Navigate to movements — the isolated team has exactly one movement (the synced one)
    await page.goto("/finances/movements");
    await expect(
      page.getByRole("button", { name: "Add Movement" }),
    ).toBeVisible({ timeout: 10000 });

    // Wait for the budget-managed movement row to appear (same description as the budget item)
    const movementRow = page.locator("[data-row-id]", {
      has: page.getByText(ITEM_DESC, { exact: true }),
    });
    await expect(movementRow).toBeVisible({ timeout: 10000 });

    // Click the link that navigates to the budget detail page
    const budgetLink = movementRow.locator('a[href*="/finances/budgets/"]');
    await expect(budgetLink).toBeVisible({ timeout: 5000 });
    await budgetLink.click();

    // URL must navigate to the budget detail with a highlight param
    await expect(page).toHaveURL(/\/finances\/budgets\/.+\?highlight=/, {
      timeout: 10000,
    });

    // The highlighted budget item row should have the blue highlight class
    await expect(page.locator(".bg-blue-100").first()).toBeVisible({
      timeout: 5000,
    });
  });
});
