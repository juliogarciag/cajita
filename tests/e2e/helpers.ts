import { expect, type Page, type Locator } from "@playwright/test";

/**
 * Add a new movement with a unique description and optional amount.
 * Returns a stable locator for the row identified by its description.
 *
 * Strategy: Click "Add Movement", click the empty description cell to enter
 * edit mode, fill the input, and confirm with Enter. The entire click→fill→Enter
 * flow is retried because ElectricSQL sync re-renders can detach DOM elements
 * mid-interaction.
 */
export async function addMovement(
  page: Page,
  description: string,
  amount?: string,
) {
  // Wait for the movements page to be fully loaded
  await expect(
    page.getByRole("button", { name: "Add Movement" }),
  ).toBeVisible({ timeout: 10000 });

  await page.getByRole("button", { name: "Add Movement" }).click();

  // The new row appears with "—" as description placeholder.
  const emptyDescCell = page
    .locator(
      '[data-cell="description"] [data-editable-cell]:not([data-disabled])',
    )
    .filter({ hasText: "—" })
    .last();
  await expect(emptyDescCell).toBeVisible({ timeout: 10000 });

  // Retry the entire click→fill→Enter flow. ElectricSQL sync can detach the
  // input element between any of these steps, so we retry the whole sequence.
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await emptyDescCell.click({ force: true });

      const descInput = page
        .locator('[data-cell="description"] input[type="text"]')
        .last();
      await expect(descInput).toBeVisible({ timeout: 2000 });
      await descInput.fill(description, { timeout: 2000 });
      await page.keyboard.press("Enter");
      break;
    } catch {
      // ElectricSQL re-render detached the element — retry
      await page.waitForTimeout(300);
    }
  }

  // Return a stable locator based on unique description
  const row = page.locator("[data-row-id]", {
    has: page.getByText(description, { exact: true }),
  });
  await expect(row).toBeVisible({ timeout: 10000 });

  // Optionally set amount — retry since ElectricSQL can detach the textbox
  if (amount) {
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const amountCell = row
          .locator("[data-editable-cell]")
          .filter({ hasText: "$0.00" })
          .first();
        await expect(amountCell).toBeVisible({ timeout: 2000 });
        await amountCell.click({ force: true });
        await row.getByRole("textbox").fill(amount, { timeout: 2000 });
        await page.keyboard.press("Enter");
        break;
      } catch {
        await page.waitForTimeout(300);
      }
    }
  }

  return row;
}

/** Delete a movement via row actions menu */
export async function deleteMovement(page: Page, row: Locator) {
  // Retry the menu open→click flow because ElectricSQL re-renders can
  // detach the menu between the button click and the menu item click.
  for (let attempt = 0; attempt < 5; attempt++) {
    await row.getByRole("button").last().click({ force: true });

    const menuItem = page.getByRole("menuitem", { name: "Delete" });
    const menuVisible = await menuItem
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    if (menuVisible) {
      await menuItem.click({ force: true });
      break;
    }

    await page.waitForTimeout(300);
  }

  await page.getByRole("button", { name: "Sure?" }).click({ force: true });
}
