import { expect, type Page, type Locator } from "@playwright/test";

/**
 * Add a new movement with a unique description and optional amount.
 * Returns a stable locator for the row identified by its description.
 *
 * Strategy: Click "Add Movement", immediately set a unique description using
 * keyboard events (avoids DOM detachment issues with fill()), then locate
 * the row by its unique description text.
 */
export async function addMovement(
  page: Page,
  description: string,
  amount?: string,
) {
  await page.getByRole("button", { name: "Add Movement" }).click();

  // The new row appears scrolled into view with "—" as description placeholder.
  // Click the last visible editable description cell with "—".
  const emptyDescCell = page
    .locator(
      '[data-cell="description"] [data-editable-cell]:not([data-disabled])',
    )
    .filter({ hasText: "—" })
    .last();
  await expect(emptyDescCell).toBeVisible({ timeout: 5000 });
  await emptyDescCell.click({ force: true });

  // Use keyboard.type() instead of fill() to avoid detached element errors
  // from ElectricSQL sync re-renders. Brief pause for click to register and
  // edit mode to activate (the div renders a textbox on click, but focus
  // stays on the div — not a focusable input — so toBeFocused() won't work).
  await page.waitForTimeout(200);
  await page.keyboard.type(description, { delay: 10 });
  await page.keyboard.press("Enter");

  // Return a stable locator based on unique description
  const row = page.locator("[data-row-id]", {
    has: page.getByText(description, { exact: true }),
  });
  await expect(row).toBeVisible({ timeout: 10000 });

  // Optionally set amount
  if (amount) {
    const amountCell = row
      .locator("[data-editable-cell]")
      .filter({ hasText: "$0.00" })
      .first();
    await expect(amountCell).toBeVisible();
    await amountCell.click({ force: true });
    await row.getByRole("textbox").fill(amount);
    await page.keyboard.press("Enter");
  }

  return row;
}

/** Delete a movement via row actions menu */
export async function deleteMovement(page: Page, row: Locator) {
  // Use force:true because ElectricSQL sync can detach elements or
  // re-render overlays that intercept pointer events.
  await row.getByRole("button").last().click({ force: true });
  await page.getByRole("menuitem", { name: "Delete" }).click({ force: true });
  await page.getByRole("button", { name: "Sure?" }).click({ force: true });
}
