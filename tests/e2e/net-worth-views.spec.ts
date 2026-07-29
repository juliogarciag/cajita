import { expect, loginIsolated } from './fixtures'
import { test, type Page, type BrowserContext } from '@playwright/test'

// One team, built up across the file
test.describe.configure({ mode: 'serial' })

const UNIQUE = Date.now()
const CASH = `Bank ${UNIQUE}`
const HOUSE = `House ${UNIQUE}`
const LOAN = `Loan ${UNIQUE}`

async function addSource(page: Page, name: string, kind: string) {
  await page.getByRole('button', { name: 'Add source' }).click()
  const input = page.getByPlaceholder('Bank account')
  await expect(input).toBeVisible()
  await input.fill(name)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByRole('columnheader', { name: new RegExp(name) })).toBeVisible({
    timeout: 10000,
  })
  await page.getByLabel(`Kind of ${name}`).selectOption(kind)
}

/** Fill one amount cell of the newest reading and commit it. */
async function fill(page: Page, cellIndex: number, value: string) {
  const cell = page.locator('tbody tr').first().locator('[data-editable-cell]').nth(cellIndex)
  await cell.click()
  const input = cell.locator('input[type="text"]')
  await expect(input).toBeVisible({ timeout: 5000 })
  await input.fill(value)
  await input.press('Enter')
  await expect(cell.locator('input')).toHaveCount(0, { timeout: 10000 })
}

test.describe('Net worth views', () => {
  let context: BrowserContext
  let page: Page

  test.beforeAll(async ({ browser }) => {
    ;({ context, page } = await loginIsolated(browser))
    await page.goto('/finances/net-worth')
    await page.getByRole('button', { name: 'Sources' }).click()
    await addSource(page, CASH, 'cash')
    await addSource(page, HOUSE, 'property')
    await addSource(page, LOAN, 'debt')
  })

  test.afterAll(async () => {
    await context.close()
  })

  test('a liability is stored as a negative and subtracts from the total', async () => {
    await page.goto('/finances/net-worth')
    await page.getByRole('button', { name: 'Add reading' }).click()
    await fill(page, 1, '10000')
    await fill(page, 2, '400000')
    await fill(page, 3, '-300000')

    // 10,000 + 400,000 − 300,000
    await expect(page.locator('tbody tr').first()).toContainText('$110,000.00', { timeout: 10000 })
  })

  test('the dashboard splits net worth into liquid and equity', async () => {
    await page.goto('/dashboard')
    const headline = page.locator('.text-3xl').first()
    await expect(headline).toHaveText('$110,000.00', { timeout: 10000 })

    await page.getByRole('button', { name: 'Liquid', exact: true }).click()
    await expect(page).toHaveURL(/metric=liquid/)
    await expect(headline).toHaveText('$10,000.00')

    await page.getByRole('button', { name: 'Equity', exact: true }).click()
    await expect(page).toHaveURL(/metric=equity/)
    // 400,000 − 300,000 — and liquid + equity is the net worth above
    await expect(headline).toHaveText('$100,000.00')

    await page.getByRole('button', { name: 'Net worth', exact: true }).click()
    await expect(page).toHaveURL(/^[^?]*$|(?!.*metric=)/)
    await expect(headline).toHaveText('$110,000.00')
  })

  test('the breakdown adds up to the metric shown', async () => {
    await page.goto('/dashboard?metric=liquid')
    // Only the kinds this metric counts are listed
    await expect(page.getByText('CASH')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('PROPERTY')).toHaveCount(0)
    await expect(page.getByText('DEBT')).toHaveCount(0)
  })

  test('a new reading is prefilled with the previous values but saves nothing', async () => {
    await page.goto('/finances/net-worth')
    await page.getByRole('button', { name: 'Add reading' }).click()

    const row = page.locator('tbody tr').first()
    // Every cell offers the previous figure...
    await expect(row).toContainText('$400,000.00', { timeout: 10000 })
    await expect(row).toContainText('-$300,000.00')
    // ...but nothing is stored until each is committed, so the reading is empty
    await expect(row).toContainText('0 of 3')
    await expect(row).toContainText('$0.00')
  })

  test('committing a carried value stores it', async () => {
    const row = page.locator('tbody tr').first()
    await fill(page, 2, '400000')
    await expect(row).toContainText('1 of 3', { timeout: 10000 })
    await expect(row).toContainText('$400,000.00')
  })
})
