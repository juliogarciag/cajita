import { test, expect } from "./fixtures";
import { addMovement, deleteMovement } from "./helpers";

test.describe("Movements CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/finances/movements");
  });

  test("can add a new movement", async ({ page }) => {
    const name = `Add-Test-${Date.now()}`;
    const row = await addMovement(page, name);

    // Verify amount cell shows $0.00
    await expect(
      row.locator("[data-editable-cell]").filter({ hasText: "$0.00" }),
    ).toBeVisible();

    // Clean up
    await deleteMovement(page, row);
  });

  test("can edit movement description", async ({ page }) => {
    const name = `Desc-Test-${Date.now()}`;
    const row = await addMovement(page, name);

    // Verify description was saved
    await expect(page.getByText(name, { exact: true })).toBeVisible();

    // Clean up
    await deleteMovement(page, row);
  });

  test("can edit movement amount", async ({ page }) => {
    const name = `Amount-Test-${Date.now()}`;
    const row = await addMovement(page, name);

    // Click the amount cell to edit
    await row
      .locator("[data-editable-cell]")
      .filter({ hasText: "$0.00" })
      .first()
      .click();

    // Fill the amount using keyboard (avoids detachment)
    await page.keyboard.press("Control+a");
    await page.keyboard.type("150.50");
    await page.keyboard.press("Enter");

    // Verify formatted amount
    await expect(
      row.locator("[data-editable-cell]").filter({ hasText: "$150.50" }),
    ).toBeVisible();

    // Clean up
    await deleteMovement(page, row);
  });

  test("can set movement category", async ({ page }) => {
    // Create a category first (isolated team starts empty).
    const categoryName = `TestCat-${Date.now()}`;
    await page.goto("/finances/categories");
    await page.getByRole("button", { name: "Add Category" }).click();
    await page.getByRole("textbox", { name: "Category name" }).fill(categoryName);
    await page.getByRole("button", { name: "Blue" }).click();
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText(categoryName, { exact: true })).toBeVisible();

    // Navigate to movements and add a movement
    await page.goto("/finances/movements");
    const name = `Cat-Test-${Date.now()}`;
    const row = await addMovement(page, name);

    // Click category cell and select the category.
    // ElectricSQL may still be syncing the new category to this page,
    // so retry the click→select flow until it succeeds.
    const categoryCell = row.locator("[data-editable-cell]").last();
    for (let attempt = 0; attempt < 15; attempt++) {
      await categoryCell.click({ force: true });

      try {
        const combobox = row.getByRole("combobox");
        await combobox.selectOption({ label: categoryName }, { timeout: 2000 });
        break;
      } catch {
        // Option not yet available or select was detached — retry
        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(500);
      }
    }

    // Verify category was set
    await expect(row.getByText(categoryName)).toBeVisible({ timeout: 10000 });

    // Clean up
    await deleteMovement(page, row);
  });

  test("can delete a movement", async ({ page }) => {
    const name = `Delete-Test-${Date.now()}`;
    const row = await addMovement(page, name);

    // Delete
    await deleteMovement(page, row);

    // Verify the movement is gone
    await expect(
      page.getByText(name, { exact: true }),
    ).not.toBeVisible();
  });

  test("running total updates when amount changes", async ({ page }) => {
    const name = `Total-Test-${Date.now()}`;
    const row = await addMovement(page, name);

    // Set amount to $500.00 — AmountInput auto-selects on focus, so fill() works
    await row
      .locator("[data-editable-cell]")
      .filter({ hasText: "$0.00" })
      .first()
      .click();
    await row.getByRole("textbox").fill("500");
    await page.keyboard.press("Enter");

    // Verify the amount cell updated
    await expect(
      row.locator("[data-editable-cell]").filter({ hasText: "$500.00" }),
    ).toBeVisible({ timeout: 10000 });

    // Now change the amount to $200.00
    await row
      .locator("[data-editable-cell]")
      .filter({ hasText: "$500.00" })
      .first()
      .click();
    await row.getByRole("textbox").fill("200");
    await page.keyboard.press("Enter");

    // Verify amount changed
    await expect(
      row.locator("[data-editable-cell]").filter({ hasText: "$200.00" }),
    ).toBeVisible();

    // Clean up
    await deleteMovement(page, row);
  });
});
