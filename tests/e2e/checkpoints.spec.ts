import { test, expect, type Page, type Locator } from "@playwright/test";

// Checkpoints share global state (only one active checkpoint at a time)
// so tests must run serially to avoid interference.
test.describe.configure({ mode: "serial" });

/**
 * Helper: Add a new movement and set its description + amount.
 * Uses the same pattern as movements.spec.ts (locator('[data-row-id]').last())
 * and returns a locator identified by unique description text.
 */
async function addMovement(page: Page, description: string, amount: string) {
  await page.getByRole("button", { name: "Add Movement" }).click();
  const newRow = page.locator("[data-row-id]").last();
  await expect(newRow).toBeVisible();

  // Set description
  const descCell = newRow.locator('[data-cell="description"]');
  await descCell.click();
  const textbox = newRow.getByRole("textbox");
  await textbox.fill(description);
  await page.keyboard.press("Enter");
  await expect(newRow.getByText(description)).toBeVisible();

  // Set amount
  await newRow
    .locator("[data-editable-cell]")
    .filter({ hasText: "$0.00" })
    .click();
  await newRow.getByRole("textbox").fill(amount);
  await page.keyboard.press("Enter");

  // Return a stable locator: find the [data-row-id] row that contains this description
  return page.locator("[data-row-id]", {
    has: page.getByText(description, { exact: true }),
  });
}

/** Helper: Delete a movement via row actions menu */
async function deleteMovement(page: Page, row: Locator) {
  await row.getByRole("button").last().click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Sure?" }).click();
}

/** Helper: Create a checkpoint on a row by entering the actual balance */
async function createCheckpoint(
  page: Page,
  row: Locator,
  actualBalance: string,
) {
  // Open row actions menu
  await row.getByRole("button").last().click();
  // Click Checkpoint menu item
  await page.getByRole("menuitem", { name: "Checkpoint" }).click();

  // Fill actual balance in the popover
  await expect(page.getByText("Balance checkpoint")).toBeVisible();
  const input = page.getByPlaceholder("0.00");
  await input.fill(actualBalance);

  // Click Checkpoint button to confirm
  await page.getByRole("button", { name: "Checkpoint" }).click();

  // Wait for the popover overlay to disappear
  await expect(page.getByText("Balance checkpoint")).not.toBeVisible();

  // Wait for the checkpoint divider to appear (ElectricSQL sync may take a moment)
  await expect(page.getByText("Checkpointed")).toBeVisible({ timeout: 15000 });
}

/** Helper: Unfreeze by clicking the Unfreeze ConfirmButton (two clicks) */
async function unfreeze(page: Page) {
  // Click "Unfreeze" — ConfirmButton switches to "Sure?"
  await page.getByRole("button", { name: "Unfreeze" }).click();
  // Click "Sure?" to confirm checkpoint deletion
  await page.getByRole("button", { name: "Sure?" }).click();
  // Wait for the checkpoint divider to disappear (ElectricSQL sync)
  await expect(page.getByText("Checkpointed")).not.toBeVisible({
    timeout: 15000,
  });
}

test.describe("Checkpoints", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/finances/movements");
    await expect(
      page.getByRole("heading", { name: "Movements" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add Movement" }),
    ).toBeVisible();

    // Clean up any leftover checkpoint from a previous failed run
    const unfreezeBtn = page.getByRole("button", { name: "Unfreeze" });
    if (await unfreezeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await unfreezeBtn.click();
      await page.getByRole("button", { name: "Sure?" }).click();
      await expect(page.getByText("Checkpointed")).not.toBeVisible({
        timeout: 15000,
      });
    }
  });

  test("can create a checkpoint on a movement", async ({ page }) => {
    const desc = `CP-Create-${Date.now()}`;
    const row = await addMovement(page, desc, "100");

    // Create checkpoint with matching balance
    await createCheckpoint(page, row, "100");

    // Verify the divider shows Expected / Actual / Diff info
    await expect(page.getByText(/Expected:/)).toBeVisible();
    await expect(page.getByText(/Actual:/)).toBeVisible();
    await expect(page.getByText(/Diff:/)).toBeVisible();

    // Clean up: unfreeze then delete
    await unfreeze(page);
    await deleteMovement(page, row);
  });

  test("frozen movements cannot be edited", async ({ page }) => {
    const desc = `CP-Frozen-${Date.now()}`;
    const row = await addMovement(page, desc, "250");

    await createCheckpoint(page, row, "250");

    // Frozen row cells have data-disabled attribute
    await expect(row.locator("[data-disabled]").first()).toBeVisible();

    // Try clicking the description cell — it should NOT enter edit mode
    await row.locator('[data-cell="description"]').click();
    await expect(row.getByRole("textbox")).not.toBeVisible();

    // Clean up: unfreeze then delete
    await unfreeze(page);
    await deleteMovement(page, row);
  });

  test("can unfreeze by deleting checkpoint", async ({ page }) => {
    const desc = `CP-Unfreeze-${Date.now()}`;
    const row = await addMovement(page, desc, "300");

    await createCheckpoint(page, row, "300");

    // Verify frozen
    await expect(row.locator("[data-disabled]").first()).toBeVisible();

    // Unfreeze
    await unfreeze(page);

    // Verify the cell is now editable again (no data-disabled)
    await expect(row.locator("[data-disabled]")).not.toBeVisible();

    // Verify the row now has action button (not lock icon) — proves it's editable
    await expect(row.getByRole("button").last()).toBeVisible();

    // Clean up
    await deleteMovement(page, row);
  });

  test("new movements added after checkpoint are NOT frozen", async ({
    page,
  }) => {
    // Add first movement and checkpoint it
    const frozenDesc = `CP-Before-${Date.now()}`;
    const frozenRow = await addMovement(page, frozenDesc, "400");
    await createCheckpoint(page, frozenRow, "400");

    // Add a new movement AFTER the checkpoint
    const afterDesc = `CP-After-${Date.now()}`;
    const newRow = await addMovement(page, afterDesc, "500");

    // The new movement should NOT be frozen — no disabled cells
    await expect(newRow.locator("[data-disabled]")).not.toBeVisible();

    // Verify the new row has action button (not lock icon), proving it's editable
    await expect(newRow.getByRole("button").last()).toBeVisible();

    // Clean up: delete new movement first (not frozen, so has action menu)
    await deleteMovement(page, newRow);

    // Unfreeze and delete the frozen movement
    await unfreeze(page);
    await deleteMovement(page, frozenRow);
  });

  test("checkpoint popover shows expected total and difference", async ({
    page,
  }) => {
    const desc = `CP-Popover-${Date.now()}`;
    const row = await addMovement(page, desc, "750");

    // Open the checkpoint popover
    await row.getByRole("button").last().click();
    await page.getByRole("menuitem", { name: "Checkpoint" }).click();

    // Verify popover elements
    await expect(page.getByText("Balance checkpoint")).toBeVisible();
    await expect(page.getByText("Expected total")).toBeVisible();

    // Fill a different amount to see the difference
    await page.getByPlaceholder("0.00").fill("800");

    // Verify difference is shown
    await expect(page.getByText("Difference")).toBeVisible();

    // Cancel instead of confirming
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Balance checkpoint")).not.toBeVisible();

    // Clean up
    await deleteMovement(page, row);
  });
});
