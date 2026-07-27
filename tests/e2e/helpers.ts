import { expect, type Page, type Locator } from '@playwright/test'

/**
 * Create an expense category via the list page UI and wait for its card.
 * Assumes the page is already on /finances/expense-categories.
 */
export async function createCategory(page: Page, name: string, color = '#3b82f6') {
  await page.getByRole('button', { name: 'Add Category' }).click()
  await expect(page.getByText('New Category')).toBeVisible()
  await page.getByPlaceholder('Category name').fill(name)
  // Colors are saved bookmarks, addressed by their hex value
  await page.getByRole('button', { name: `Use color ${color}` }).click()
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByText(name, { exact: true })).toBeVisible({
    timeout: 10000,
  })
}

/** Navigate from the list page into a category's detail page. */
export async function openCategory(page: Page, name: string) {
  // Category cards have an absolute-positioned <a> overlay that intercepts
  // pointer events. Use force:true to click through the overlay.
  await page.getByText(name, { exact: true }).click({ force: true })
  await expect(page.getByRole('heading', { name })).toBeVisible({
    timeout: 10000,
  })
}

/**
 * Add an expense with a unique description and optional amounts.
 * Returns a stable locator for the row identified by its description.
 *
 * Strategy: Click "Add Expense" — a new row appears with the description cell
 * auto-focused in edit mode. Fill it and blur to save. The fill flow is
 * retried because ElectricSQL sync re-renders can detach DOM elements
 * mid-interaction.
 */
export async function addExpense(
  page: Page,
  description: string,
  amounts?: { soles?: string; usd?: string },
): Promise<Locator> {
  await expect(page.getByRole('button', { name: 'Add Expense' })).toBeVisible({
    timeout: 10000,
  })
  await page.getByRole('button', { name: 'Add Expense' }).click()

  // The new row's description cell auto-enters edit mode with a text input.
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const descInput = page.locator("[data-editable-table] input[type='text']").last()
      await expect(descInput).toBeVisible({ timeout: 2000 })
      await descInput.fill(description, { timeout: 2000 })
      // Blur via the heading to save without hopping into the date picker.
      await page.getByRole('heading').first().click()
      break
    } catch {
      // ElectricSQL re-render detached the element — retry
      await page.waitForTimeout(300)
    }
  }

  const row = page.locator('div[id]', {
    has: page.getByText(description, { exact: true }),
  })
  await expect(row).toBeVisible({ timeout: 10000 })

  // Cells within the row: 0=description, 1=date, 2=soles, 3=usd
  if (amounts?.soles) {
    await fillAmountCell(page, row, 2, amounts.soles)
  }
  if (amounts?.usd) {
    await fillAmountCell(page, row, 3, amounts.usd)
  }

  return row
}

async function fillAmountCell(page: Page, row: Locator, cellIndex: number, value: string) {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await row.locator('[data-editable-cell]').nth(cellIndex).click()
      const input = row.locator("input[type='text']")
      await expect(input).toBeVisible({ timeout: 2000 })
      await input.fill(value, { timeout: 2000 })
      // Blur via the heading to save without focusing the adjacent cell.
      await page.getByRole('heading').first().click()
      break
    } catch {
      await page.waitForTimeout(300)
    }
  }
}
