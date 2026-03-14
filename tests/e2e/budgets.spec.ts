import { test, expect, type Page } from "@playwright/test";

// Budget tests modify shared state (categories, movements) and must run serially
test.describe.configure({ mode: "serial" });

const UNIQUE = Date.now();

/** Navigate to a budget's detail page */
async function navigateToBudget(page: Page, budgetName: string) {
  // Budget cards have an absolute-positioned <a> overlay that intercepts pointer events.
  // Use force:true to click through the overlay.
  await page
    .getByText(budgetName, { exact: true })
    .click({ force: true });
  await expect(
    page.getByRole("heading", { name: budgetName }),
  ).toBeVisible({ timeout: 10000 });
}

test.describe("Budgets", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/finances/budgets");
    await expect(
      page.getByRole("heading", { name: "Budgets" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add Budget" }),
    ).toBeVisible();
  });

  test("can create a new budget", async ({ page }) => {
    const budgetName = `TestBudget-${UNIQUE}`;

    await page.getByRole("button", { name: "Add Budget" }).click();
    await expect(page.getByText("New Budget")).toBeVisible();

    // Fill form: Name, Amount, Color
    await page
      .getByRole("textbox", { name: "Budget name" })
      .fill(budgetName);
    await page.getByPlaceholder("500.00").fill("1200");
    await page.getByRole("button", { name: "Blue" }).click();
    await page.getByRole("button", { name: "Create" }).click();

    // Verify budget appears
    await expect(page.getByText(budgetName)).toBeVisible();
  });

  test("can navigate to budget detail and see summary", async ({ page }) => {
    const budgetName = `TestBudget-${UNIQUE}`;

    await navigateToBudget(page, budgetName);

    // Verify summary bar
    await expect(page.getByText(/Annual: \$1,200\.00/)).toBeVisible();
    await expect(page.getByText(/Remaining:/)).toBeVisible();
  });

  test("can add a budget item", async ({ page }) => {
    const budgetName = `TestBudget-${UNIQUE}`;

    await navigateToBudget(page, budgetName);

    // Click Add Item
    await page.getByRole("button", { name: "Add Item" }).click();
    await expect(page.getByText("New Item")).toBeVisible();

    // Description (first textbox, auto-focused)
    await page.getByRole("textbox").first().fill("Test Item E2E");

    // USD amount (placeholder like "55.42")
    await page.getByPlaceholder("55.42").fill("350");

    // Submit
    await page.getByRole("button", { name: "Add" }).click();

    // Verify item appears
    await expect(page.getByText("Test Item E2E")).toBeVisible();
  });

  test("can sync a budget item to movements", async ({ page }) => {
    const budgetName = `TestBudget-${UNIQUE}`;

    await navigateToBudget(page, budgetName);
    await expect(page.getByText("Test Item E2E")).toBeVisible();

    // Need to set accounting date before sync is enabled.
    // The Acct. Date cell shows "—" when empty. Click it to enter edit mode.
    // Find all "—" cells that are editable (there may be one for Soles and one for Acct. Date)
    const pendingDateCells = page
      .locator("[data-editable-cell]")
      .filter({ hasText: "—" });
    // The accounting date "—" is the last one in the item row
    await pendingDateCells.last().click();

    // A DatePicker calendar opens automatically via react-day-picker.
    // Today's button has aria-label starting with "Today, " (e.g. "Today, Friday, March 14th, 2026").
    await page.getByRole("button", { name: /^Today,/ }).click();

    // Wait for the Sync button to become enabled
    const syncBtn = page.getByRole("button", { name: "Sync" });
    await expect(syncBtn).toBeEnabled({ timeout: 5000 });
    await syncBtn.click();

    // Verify status changes to "Synced"
    await expect(page.getByText("Synced")).toBeVisible({ timeout: 10000 });
  });

  test("can unsync a budget item from movements", async ({ page }) => {
    const budgetName = `TestBudget-${UNIQUE}`;

    await navigateToBudget(page, budgetName);

    // Wait for item
    await expect(page.getByText("Test Item E2E")).toBeVisible();
    await expect(page.getByText("Synced")).toBeVisible();

    // Click unsync button (title="Unsync from accounting")
    await page
      .getByRole("button", { name: "Unsync from accounting" })
      .click();

    // Verify "Pending" appears instead of "Synced"
    await expect(page.getByText("Pending")).toBeVisible({ timeout: 10000 });
  });

  test("can delete a budget", async ({ page }) => {
    const budgetName = `TestBudget-${UNIQUE}`;

    // Budget card: find the × button near the budget name text.
    // The ConfirmButton has z-10, so it's above the link overlay.
    const deleteBtn = page
      .getByText(budgetName, { exact: true })
      .locator("xpath=ancestor::div[contains(@class,'rounded-lg')]")
      .getByRole("button", { name: "×" });
    await expect(deleteBtn).toBeVisible({ timeout: 5000 });
    await deleteBtn.click({ force: true });
    await page.getByRole("button", { name: "Sure?" }).click({ force: true });

    // Verify budget is gone
    await expect(
      page.getByText(budgetName, { exact: true }),
    ).not.toBeVisible({ timeout: 10000 });

    // Verify the auto-created category is also removed
    await page.goto("/finances/categories");
    await expect(
      page.getByRole("heading", { name: "Categories" }),
    ).toBeVisible();
    await expect(
      page.getByText(budgetName, { exact: true }),
    ).not.toBeVisible();
  });
});
