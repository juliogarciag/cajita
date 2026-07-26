import { expect, loginIsolated } from './fixtures'
import { test, type Page, type BrowserContext } from '@playwright/test'
import { createCategory, openCategory, addExpense } from './helpers'

// These tests build on shared state and must run serially
test.describe.configure({ mode: 'serial' })

const UNIQUE = Date.now()
const CATEGORY_NAME = `TestCategory-${UNIQUE}`
const RENAMED_NAME = `Renamed-${UNIQUE}`
const ITEM_DESC = `TestExpense-${UNIQUE}`

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
    await expect(page.getByRole('heading', { name: 'Expense Categories' })).toBeVisible()
  })

  test('can create a new category', async () => {
    await createCategory(page, CATEGORY_NAME, 'Blue')
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

    // Summary bar reflects totals
    await expect(page.getByText(/Total \(Soles\)/)).toBeVisible()
    await expect(page.getByText(/Total \(USD\)/)).toBeVisible()
    await expect(page.getByText('$350.00').first()).toBeVisible()
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

    // Navigates to the category detail with highlightItem param
    await expect(page).toHaveURL(/\/finances\/expense-categories\/.+\?highlightItem=/, {
      timeout: 10000,
    })

    // The highlighted row flashes blue
    await expect(page.locator('.bg-blue-100').first()).toBeVisible({
      timeout: 5000,
    })
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
    await row.getByRole('button').last().click({ force: true })
    await page.getByRole('button', { name: 'Sure?' }).click({ force: true })

    await expect(page.getByText(ITEM_DESC, { exact: true })).not.toBeVisible({
      timeout: 10000,
    })
  })

  test('can delete the category', async () => {
    const card = page.locator('[data-category-card]', {
      has: page.getByText(RENAMED_NAME, { exact: true }),
    })
    const deleteBtn = card.getByRole('button', { name: '×' })
    await expect(deleteBtn).toBeVisible({ timeout: 5000 })
    await deleteBtn.click({ force: true })
    await page.getByRole('button', { name: 'Sure?' }).click({ force: true })

    await expect(page.getByText(RENAMED_NAME, { exact: true })).not.toBeVisible({ timeout: 10000 })
  })
})
