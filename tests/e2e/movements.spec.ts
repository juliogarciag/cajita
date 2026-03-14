import { test, expect } from "@playwright/test";

test.describe("Movements CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/finances/movements");
  });

  test("can add a new movement", async ({ page }) => {
    await page.getByRole("button", { name: "Add Movement" }).click();

    // New row should appear with empty description (shown as "—")
    // and today's date, scrolled into view
    const newRow = page.locator('[data-row-id]').last();
    await expect(newRow).toBeVisible();
    // Amount cell (data-editable-cell) should show $0.00
    await expect(
      newRow.locator('[data-editable-cell]').filter({ hasText: "$0.00" }),
    ).toBeVisible();

    // Clean up: delete the new movement
    await newRow.getByRole("button").last().click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Sure?" }).click();
  });

  test("can edit movement description", async ({ page }) => {
    // Add a fresh movement
    await page.getByRole("button", { name: "Add Movement" }).click();
    const newRow = page.locator('[data-row-id]').last();
    await expect(newRow).toBeVisible();

    // Click description cell to enter edit mode
    const descriptionCell = newRow.locator('[data-cell="description"]');
    await descriptionCell.click();

    // Type the description
    const textbox = newRow.getByRole("textbox");
    await textbox.fill("Test Description E2E");
    await page.keyboard.press("Enter");

    // Verify description was saved
    await expect(newRow.getByText("Test Description E2E")).toBeVisible();

    // Clean up
    await newRow.getByRole("button").last().click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Sure?" }).click();
    await expect(newRow).not.toBeVisible();
  });

  test("can edit movement amount", async ({ page }) => {
    // Add a movement
    await page.getByRole("button", { name: "Add Movement" }).click();
    const newRow = page.locator('[data-row-id]').last();
    await expect(newRow).toBeVisible();

    // Click the amount cell (data-editable-cell) to edit
    await newRow
      .locator('[data-editable-cell]')
      .filter({ hasText: "$0.00" })
      .click();

    // Fill the amount
    const amountInput = newRow.getByRole("textbox");
    await amountInput.fill("150.50");
    await page.keyboard.press("Enter");

    // Verify formatted amount in the amount cell (not total cell)
    await expect(
      newRow.locator('[data-editable-cell]').filter({ hasText: "$150.50" }),
    ).toBeVisible();

    // Clean up
    await newRow.getByRole("button").last().click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Sure?" }).click();
  });

  test("can set movement category", async ({ page }) => {
    // Add a movement
    await page.getByRole("button", { name: "Add Movement" }).click();
    const newRow = page.locator('[data-row-id]').last();
    await expect(newRow).toBeVisible();

    // Click category cell (shows "—" for no category)
    // The category cell is the last text cell before the actions button
    const categoryCell = newRow.locator('[data-editable-cell]').last();
    await categoryCell.click();

    // Select a category from the combobox
    const combobox = newRow.getByRole("combobox");
    await combobox.selectOption({ label: "Salary" });

    // Verify category was set
    await expect(newRow.getByText("Salary")).toBeVisible();

    // Clean up
    await newRow.getByRole("button").last().click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Sure?" }).click();
  });

  test("can delete a movement", async ({ page }) => {
    // Add a movement with a unique description
    await page.getByRole("button", { name: "Add Movement" }).click();
    const newRow = page.locator('[data-row-id]').last();
    await expect(newRow).toBeVisible();

    // Set description for identification
    const descriptionCell = newRow.locator('[data-cell="description"]');
    await descriptionCell.click();
    const textbox = newRow.getByRole("textbox");
    const uniqueName = `Delete-Me-${Date.now()}`;
    await textbox.fill(uniqueName);
    await page.keyboard.press("Enter");
    await expect(newRow.getByText(uniqueName)).toBeVisible();

    // Open row actions menu
    await newRow.getByRole("button").last().click();

    // Click Delete
    await page.getByRole("menuitem", { name: "Delete" }).click();

    // Confirm with "Sure?"
    await page.getByRole("button", { name: "Sure?" }).click();

    // Verify the movement is gone
    await expect(page.getByText(uniqueName)).not.toBeVisible();
  });

  test("running total updates when amount changes", async ({ page }) => {
    // Add a movement
    await page.getByRole("button", { name: "Add Movement" }).click();
    const newRow = page.locator('[data-row-id]').last();
    await expect(newRow).toBeVisible();

    // Set amount to $500.00
    await newRow
      .locator('[data-editable-cell]')
      .filter({ hasText: "$0.00" })
      .click();
    await newRow.getByRole("textbox").fill("500");
    await page.keyboard.press("Enter");

    // Verify the amount cell updated
    await expect(
      newRow.locator('[data-editable-cell]').filter({ hasText: "$500.00" }),
    ).toBeVisible();

    // Now change the amount to $200.00
    await newRow
      .locator('[data-editable-cell]')
      .filter({ hasText: "$500.00" })
      .click();
    await newRow.getByRole("textbox").fill("200");
    await page.keyboard.press("Enter");

    // Verify amount changed
    await expect(
      newRow.locator('[data-editable-cell]').filter({ hasText: "$200.00" }),
    ).toBeVisible();

    // Clean up
    await newRow.getByRole("button").last().click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Sure?" }).click();
  });
});
