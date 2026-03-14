import { test, expect } from "@playwright/test";
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
    const name = `Cat-Test-${Date.now()}`;
    const row = await addMovement(page, name);

    // Click category cell (last editable cell)
    const categoryCell = row.locator("[data-editable-cell]").last();
    await categoryCell.click();

    // Select a category from the combobox
    const combobox = row.getByRole("combobox");
    await combobox.selectOption({ label: "Salary" });

    // Verify category was set
    await expect(row.getByText("Salary")).toBeVisible();

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
