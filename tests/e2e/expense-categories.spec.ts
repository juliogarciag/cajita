import { expect, loginIsolated } from './fixtures'
import { test, type Page, type BrowserContext } from '@playwright/test'
import { createCategory, openCategory, addExpense, confirmDialog } from './helpers'

// These tests build on shared state and must run serially
test.describe.configure({ mode: 'serial' })

const UNIQUE = Date.now()
const CATEGORY_NAME = `TestCategory-${UNIQUE}`
const RENAMED_NAME = `Renamed-${UNIQUE}`
const ITEM_DESC = `TestExpense-${UNIQUE}`
const PENDING_DESC = `Pending-${UNIQUE}`
const REFUND_DESC = `Refund-${UNIQUE}`
const SOLES_REFUND_DESC = `SolesRefund-${UNIQUE}`

test.describe('Expense Categories', () => {
  let context: BrowserContext
  let page: Page

  test.beforeAll(async ({ browser }) => {
    ;({ context, page } = await loginIsolated(browser))
  })

  test.afterAll(async () => {
    await context.close()
  })

  test.beforeEach(async () => {
    await page.goto('/finances/expense-categories')
    await expect(page.getByRole('heading', { name: 'Expense categories' })).toBeVisible()
  })

  test('can create a new category', async () => {
    await createCategory(page, CATEGORY_NAME)
  })

  test('can add an expense with soles and USD amounts', async () => {
    await openCategory(page, CATEGORY_NAME)

    await addExpense(page, ITEM_DESC, { soles: '1300', usd: '350' })

    // Row shows both formatted amounts
    const row = page.locator('div[id]', {
      has: page.getByText(ITEM_DESC, { exact: true }),
    })
    await expect(row.getByText(/S\/\s?1,300\.00/)).toBeVisible({
      timeout: 10000,
    })
    await expect(row.getByText('$350.00')).toBeVisible({ timeout: 10000 })

    // Summary bar: USD is the canonical total; this item has a USD amount,
    // so nothing is pending.
    await expect(page.getByText(/Total \(USD\)/)).toBeVisible()
    await expect(page.getByText('$350.00').first()).toBeVisible()
    await expect(page.getByText(/Pending exchange/)).toBeVisible()
    await expect(page.getByText(/S\/\s?0\.00/)).toBeVisible()
  })

  test('soles-only expenses count as pending', async () => {
    await openCategory(page, CATEGORY_NAME)

    await addExpense(page, PENDING_DESC, { soles: '800' })

    // The pending bucket picks up the soles-only item; the USD total doesn't move
    const summary = page.getByText(/Pending exchange/)
    await expect(summary).toBeVisible()
    await expect(summary.getByText(/S\/\s?800\.00/)).toBeVisible({ timeout: 10000 })
    await expect(summary.getByText(/1 item/)).toBeVisible()
    await expect(page.getByText('$350.00').first()).toBeVisible()
  })

  test('a reimbursement is a negative amount that subtracts from the total', async () => {
    await openCategory(page, CATEGORY_NAME)

    // The $350 expense came back — logged as a credit rather than deleted, so
    // what it was for stays in the history.
    await addExpense(page, REFUND_DESC, { usd: '-120' })

    const row = page.locator('div[id]', {
      has: page.getByText(REFUND_DESC, { exact: true }),
    })
    // The sign survives the round trip instead of being flipped on save
    await expect(row.getByText('-$120.00')).toBeVisible({ timeout: 10000 })

    // 350 − 120
    await expect(page.getByText('$230.00').first()).toBeVisible({ timeout: 10000 })
  })

  test('a soles reimbursement stays out of the pending bucket', async () => {
    await openCategory(page, CATEGORY_NAME)

    await addExpense(page, SOLES_REFUND_DESC, { soles: '-300' })

    const row = page.locator('div[id]', {
      has: page.getByText(SOLES_REFUND_DESC, { exact: true }),
    })
    await expect(row.getByText(/-S\/\s?300\.00/)).toBeVisible({ timeout: 10000 })

    // Still S/800, not S/500: soles coming back aren't soles waiting to be
    // exchanged, so netting them here would understate what's outstanding.
    const summary = page.getByText(/Pending exchange/)
    await expect(summary.getByText(/S\/\s?800\.00/)).toBeVisible({ timeout: 10000 })
    await expect(summary.getByText(/1 item/)).toBeVisible()
  })

  test('search palette finds the expense and deep-links to it', async () => {
    // Open the palette with Cmd/Ctrl+K
    await page.keyboard.press('ControlOrMeta+k')
    const searchInput = page.getByPlaceholder('Search expenses…')
    await expect(searchInput).toBeVisible()

    await searchInput.fill(ITEM_DESC)

    // The result row shows the description
    const option = page.getByRole('option', {
      name: new RegExp(ITEM_DESC),
    })
    await expect(option).toBeVisible({ timeout: 10000 })
    await option.click()

    // Navigates to the category detail with highlightItem + year params
    await expect(page).toHaveURL(/\/finances\/expense-categories\/.+[?&]highlightItem=/, {
      timeout: 10000,
    })
    await expect(page).toHaveURL(/[?&]year=\d{4}/)

    // The highlighted row flashes blue
    await expect(page.locator('.bg-blue-100').first()).toBeVisible({
      timeout: 5000,
    })
  })

  test('year filter is tied to the URL', async () => {
    await openCategory(page, CATEGORY_NAME)

    const currentYear = new Date().getFullYear()

    // The expense added earlier (dated today) is visible in the default view
    await expect(page.getByText(ITEM_DESC, { exact: true })).toBeVisible({ timeout: 10000 })

    // Jump to an empty year via the URL
    const url = page.url().split('?')[0]
    await page.goto(`${url}?year=2020`)
    await expect(page.getByText('No expenses in 2020.', { exact: false })).toBeVisible({
      timeout: 10000,
    })
    await expect(page.getByText(ITEM_DESC, { exact: true })).not.toBeVisible()

    // Switch back via the year dropdown — URL updates and the item reappears
    await page.getByLabel('Year', { exact: true }).selectOption(String(currentYear))
    await expect(page).toHaveURL(new RegExp(`[?&]year=${currentYear}`), { timeout: 10000 })
    await expect(page.getByText(ITEM_DESC, { exact: true })).toBeVisible({ timeout: 10000 })
  })

  test('year arrows step through years and stop at the ends', async () => {
    await openCategory(page, CATEGORY_NAME)

    const currentYear = new Date().getFullYear()
    const yearSelect = page.getByLabel('Year', { exact: true })

    // Only the current year has data, so both arrows are dead ends
    await expect(yearSelect).toHaveValue(String(currentYear))
    await expect(page.getByRole('button', { name: 'Previous year' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Next year' })).toBeDisabled()

    // Visiting another year via the URL adds it to the range, so stepping works
    const url = page.url().split('?')[0]
    await page.goto(`${url}?year=${currentYear - 1}`)
    await expect(yearSelect).toHaveValue(String(currentYear - 1))

    await page.getByRole('button', { name: 'Next year' }).click()
    await expect(page).toHaveURL(new RegExp(`[?&]year=${currentYear}`), { timeout: 10000 })
    await expect(yearSelect).toHaveValue(String(currentYear))
    await expect(page.getByRole('button', { name: 'Next year' })).toBeDisabled()
  })

  test('category row totals are scoped to the selected year', async () => {
    const currentYear = new Date().getFullYear()
    const categoryRow = page.locator('[data-category-row]', {
      has: page.getByText(CATEGORY_NAME, { exact: true }),
    })

    // Default view is the current year, where all three expenses live
    // Cells: name, expenses, pending exchange, total, actions
    await expect(categoryRow.getByRole('cell').nth(1)).toHaveText('4', { timeout: 10000 })
    // 350 − 120: the reimbursement is counted, not ignored
    await expect(categoryRow.getByRole('cell').nth(3)).toHaveText('$230.00')

    // A past year has none of them
    await page.goto(`/finances/expense-categories?year=${currentYear - 1}`)
    await expect(categoryRow.getByRole('cell').nth(1)).toHaveText('0', { timeout: 10000 })
    await expect(categoryRow.getByRole('cell').nth(3)).toHaveText('$0.00')

    // ...but deletion still counts every year, so it stays blocked
    await expect(categoryRow.getByLabel('Cannot delete a category with expenses')).toBeVisible()

    // Opening the category carries the year through
    await page.getByText(CATEGORY_NAME, { exact: true }).click({ force: true })
    await expect(page).toHaveURL(new RegExp(`[?&]year=${currentYear - 1}`), { timeout: 10000 })
  })

  test('can rename the category from the detail page', async () => {
    await openCategory(page, CATEGORY_NAME)

    await page.getByRole('heading', { name: CATEGORY_NAME }).click()
    const input = page.locator('input').first()
    await input.fill(RENAMED_NAME)
    await input.press('Enter')

    await expect(page.getByRole('heading', { name: RENAMED_NAME })).toBeVisible({ timeout: 10000 })
  })

  test('can delete an expense', async () => {
    await openCategory(page, RENAMED_NAME)

    const row = page.locator('div[id]', {
      has: page.getByText(ITEM_DESC, { exact: true }),
    })
    await expect(row).toBeVisible({ timeout: 10000 })

    // Trash button → confirm
    await row.getByRole('button', { name: 'Delete expense?' }).click({ force: true })
    await confirmDialog(page, 'Delete expense')

    await expect(page.getByText(ITEM_DESC, { exact: true })).not.toBeVisible({
      timeout: 10000,
    })
  })

  test('a category with expenses cannot be deleted', async () => {
    // The pending expense is still there, so the card offers no delete button
    const categoryRow = page.locator('[data-category-row]', {
      has: page.getByText(RENAMED_NAME, { exact: true }),
    })
    await expect(categoryRow).toBeVisible({ timeout: 10000 })
    await expect(categoryRow.getByLabel('Cannot delete a category with expenses')).toBeVisible()
    await expect(categoryRow.getByRole('button', { name: 'Delete category?' })).toHaveCount(0)
  })

  test('can delete the category once it is empty', async () => {
    // Remove the expenses that are left
    await openCategory(page, RENAMED_NAME)
    for (const desc of [PENDING_DESC, REFUND_DESC, SOLES_REFUND_DESC]) {
      const row = page.locator('div[id]', {
        has: page.getByText(desc, { exact: true }),
      })
      await expect(row).toBeVisible({ timeout: 10000 })
      await row.getByRole('button', { name: 'Delete expense?' }).click({ force: true })
      await confirmDialog(page, 'Delete expense')
      await expect(page.getByText(desc, { exact: true })).not.toBeVisible({ timeout: 10000 })
    }

    await page.goto('/finances/expense-categories')
    const categoryRow = page.locator('[data-category-row]', {
      has: page.getByText(RENAMED_NAME, { exact: true }),
    })
    const deleteBtn = categoryRow.getByRole('button', { name: 'Delete category?' })
    await expect(deleteBtn).toBeVisible({ timeout: 10000 })
    await deleteBtn.click({ force: true })
    await confirmDialog(page, 'Delete category')

    await expect(page.getByText(RENAMED_NAME, { exact: true })).not.toBeVisible({ timeout: 10000 })
  })

  test('a color can be saved and removed from the palette', async () => {
    await page.getByRole('button', { name: 'Add Category' }).click()
    await expect(page.getByText('New Category')).toBeVisible()

    const customColor = '#123abc'
    await page.getByLabel('Hex color').fill(customColor)
    await page.getByLabel('Hex color').press('Enter')

    // Not in the palette yet — save it
    await expect(page.getByRole('button', { name: `Use color ${customColor}` })).toHaveCount(0)
    await page.getByRole('button', { name: 'Save' }).click()

    const swatch = page.getByRole('button', { name: `Use color ${customColor}` })
    await expect(swatch).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible()

    // Remove it again — the × only appears while hovering the swatch
    await swatch.hover()
    await page.getByRole('button', { name: `Remove color ${customColor}` }).click()
    await expect(swatch).toHaveCount(0, { timeout: 10000 })
  })
})
