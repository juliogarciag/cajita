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

/** Reading rows only — the table also carries a header row per year. */
function rows(page: Page) {
  return page.locator('tr[data-reading-id]')
}

/** Correct one balance of the newest reading through the edit dialog. */
async function fill(page: Page, source: string, value: string) {
  await rows(page).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByLabel(source).fill(value)
  await dialog.getByRole('button', { name: 'Save changes' }).click()
  await expect(dialog).toHaveCount(0, { timeout: 10000 })
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
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel(CASH).fill('10000')
    await dialog.getByLabel(HOUSE).fill('400000')
    await dialog.getByLabel(LOAN).fill('-300000')
    // 10,000 + 400,000 − 300,000, totalled before it is saved
    await expect(dialog).toContainText('$110,000.00')
    await dialog.getByRole('button', { name: 'Add reading' }).click()

    await expect(rows(page).first()).toContainText('$110,000.00', { timeout: 10000 })
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

  test('the dialog prefills the previous reading and cancelling records nothing', async () => {
    await page.goto('/finances/net-worth')
    await expect(rows(page)).toHaveCount(1, { timeout: 10000 })

    await page.getByRole('button', { name: 'Add reading' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByLabel(HOUSE)).toHaveValue('400000.00')
    await expect(dialog.getByLabel(LOAN)).toHaveValue('-300000.00')
    await expect(dialog).toContainText('3 of 3 filled')
    // The reading's name is offered, not imposed
    await expect(dialog.getByLabel('Name')).toHaveValue('')
    await expect(dialog.getByLabel('Name')).toHaveAttribute('placeholder', / reading( \d+)?$/)

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(rows(page)).toHaveCount(1)
  })

  test('correcting one prefilled figure records the rest unchanged', async () => {
    await page.getByRole('button', { name: 'Add reading' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel(CASH).fill('12000')
    await dialog.getByRole('button', { name: 'Add reading' }).click()
    await expect(dialog).toHaveCount(0, { timeout: 10000 })

    const row = rows(page).first()
    await expect(row).toContainText('$112,000.00', { timeout: 10000 })
    await expect(row).not.toContainText('of 3')
  })

  test('a source left blank is flagged until the reading is edited', async () => {
    await page.getByRole('button', { name: 'Add reading' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel(HOUSE).fill('')
    await dialog.getByRole('button', { name: 'Add reading' }).click()
    await expect(dialog).toHaveCount(0, { timeout: 10000 })

    const row = rows(page).first()
    await expect(row).toContainText('2 of 3', { timeout: 10000 })

    await fill(page, HOUSE, '400000')
    await expect(row).not.toContainText('of 3', { timeout: 10000 })
    await expect(row).toContainText('$400,000.00')
  })

  test('a year divider separates readings from different years', async () => {
    const lastYear = new Date().getFullYear() - 1
    // No divider while every reading sits in the same year
    await expect(page.locator('[data-year-divider]')).toHaveCount(0)

    await page.getByRole('button', { name: 'Add reading' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Date').fill(`${lastYear}-06-30`)
    await dialog.getByRole('button', { name: 'Add reading' }).click()
    await expect(dialog).toHaveCount(0, { timeout: 10000 })

    const divider = page.locator(`[data-year-divider="${lastYear}"]`)
    await expect(divider).toHaveCount(1, { timeout: 10000 })
    await expect(divider).toContainText(String(lastYear))
  })
})
