import { expect, loginIsolated } from './fixtures'
import { test, type Page, type BrowserContext } from '@playwright/test'
import { confirmDialog } from './helpers'

// Builds up one team's net worth history across the file
test.describe.configure({ mode: 'serial' })

const UNIQUE = Date.now()
const BANK = `Bank ${UNIQUE}`
const BROKER = `Broker ${UNIQUE}`

/** Fill the amount cell at `cellIndex` (0 = date, 1.. = sources) of a reading row. */
async function setBalance(page: Page, rowIndex: number, cellIndex: number, value: string) {
  const row = page.locator('tbody tr').nth(rowIndex)
  const cell = row.locator('[data-editable-cell]').nth(cellIndex)
  await cell.click()
  const input = cell.locator('input[type="text"]')
  await expect(input).toBeVisible({ timeout: 5000 })
  await input.fill(value)
  // Enter saves and moves on to the next cell, so wait on this cell only —
  // the row still holds an input, just a different one.
  await input.press('Enter')
  await expect(cell.locator('input')).toHaveCount(0, { timeout: 10000 })
}

async function addSource(page: Page, name: string) {
  await page.getByRole('button', { name: 'Add source' }).click()
  const input = page.getByPlaceholder('Bank account')
  await expect(input).toBeVisible()
  await input.fill(name)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByRole('columnheader', { name: new RegExp(name) })).toBeVisible({
    timeout: 10000,
  })
}

test.describe('Net worth', () => {
  let context: BrowserContext
  let page: Page

  test.beforeAll(async ({ browser }) => {
    ;({ context, page } = await loginIsolated(browser))
  })

  test.afterAll(async () => {
    await context.close()
  })

  test.beforeEach(async () => {
    await page.goto('/finances/net-worth')
    await expect(page.getByRole('heading', { name: 'Balances' })).toBeVisible()
  })

  test('a reading cannot be added before there are sources', async () => {
    await expect(page.getByText('No sources yet. Add your accounts under Sources')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add reading' })).toBeDisabled()
  })

  test('adding sources creates the columns', async () => {
    await page.getByRole('button', { name: 'Sources' }).click()
    await addSource(page, BANK)
    await addSource(page, BROKER)
    await expect(page.getByRole('button', { name: 'Add reading' })).toBeEnabled()
  })

  test('a reading sums the sources filled in', async () => {
    await page.getByRole('button', { name: 'Add reading' }).click()
    await expect(page.locator('tbody tr')).toHaveCount(1, { timeout: 10000 })

    await setBalance(page, 0, 1, '30000')
    await setBalance(page, 0, 2, '230')

    const row = page.locator('tbody tr').first()
    await expect(row.getByText('$30,230.00')).toBeVisible({ timeout: 10000 })
    // Headline picks it up
    await expect(page.getByText('$30,230.00').first()).toBeVisible()
  })

  test('a half-filled sweep is flagged and left out of the headline', async () => {
    await page.getByRole('button', { name: 'Add reading' }).click()
    await expect(page.locator('tbody tr')).toHaveCount(2, { timeout: 10000 })

    // Newest row is on top — fill only the first source
    await setBalance(page, 0, 1, '31500')

    const partial = page.locator('tbody tr').first()
    await expect(partial.getByText('1 of 2')).toBeVisible({ timeout: 10000 })

    // The headline keeps reporting the last complete reading, not the partial one
    const headline = page.locator('h1').locator('..')
    await expect(headline.getByText('$30,230.00')).toBeVisible()
    await expect(headline.getByText('$31,500.00')).toHaveCount(0)
  })

  test('completing the sweep clears the flag and shows the change', async () => {
    await setBalance(page, 0, 2, '512.30')

    const row = page.locator('tbody tr').first()
    await expect(row.getByText('1 of 2')).toHaveCount(0, { timeout: 10000 })
    await expect(row.getByText('$32,012.30')).toBeVisible()
    await expect(row.getByText('+$1,782.30')).toBeVisible()
  })

  test('a source with recorded balances is archived, not deleted', async () => {
    await page.getByRole('button', { name: 'Sources' }).click()
    await expect(page.getByLabel('Cannot delete a source with balances').first()).toBeVisible()

    // Archiving drops it out of future readings but keeps the column with history
    await page.getByRole('button', { name: `Archive ${BROKER}` }).click()
    await expect(page.getByRole('button', { name: `Unarchive ${BROKER}` })).toBeVisible({
      timeout: 10000,
    })
    await expect(page.getByRole('columnheader', { name: new RegExp(BROKER) })).toBeVisible()

    await page.getByRole('button', { name: `Unarchive ${BROKER}` }).click()
    await expect(page.getByRole('button', { name: `Archive ${BROKER}` })).toBeVisible({
      timeout: 10000,
    })
  })

  test('a frozen reading refuses edits and deletion', async () => {
    const row = page.locator('tbody tr').first()
    await row.getByRole('button', { name: 'Freeze this reading' }).click()

    const frozen = page.locator('tbody tr[data-locked="true"]')
    await expect(frozen).toHaveCount(1, { timeout: 10000 })

    // No delete button while frozen — unfreezing is the deliberate first step
    await expect(frozen.getByRole('button', { name: 'Delete this reading' })).toHaveCount(0)
    await expect(frozen.getByRole('button', { name: 'Unfreeze this reading' })).toBeVisible()

    // Cells no longer open for editing
    await frozen.locator('[data-editable-cell]').nth(1).click()
    await expect(frozen.locator('input')).toHaveCount(0)
  })

  test('a frozen reading can be unfrozen again', async () => {
    const frozen = page.locator('tbody tr[data-locked="true"]').first()
    await frozen.getByRole('button', { name: 'Unfreeze this reading' }).click()
    await confirmDialog(page, 'Unfreeze')

    await expect(page.locator('tbody tr[data-locked="true"]')).toHaveCount(0, { timeout: 10000 })
    await expect(
      page.locator('tbody tr').first().getByRole('button', { name: 'Delete this reading' }),
    ).toBeVisible()
  })

  test('freeze previous locks everything but the newest reading', async () => {
    await page.getByRole('button', { name: 'Freeze previous' }).click()

    // Two readings exist, so exactly the older one freezes
    await expect(page.locator('tbody tr[data-locked="true"]')).toHaveCount(1, { timeout: 10000 })
    await expect(page.locator('tbody tr').first()).not.toHaveAttribute('data-locked', 'true')

    // Nothing left to freeze, so the action disappears
    await expect(page.getByRole('button', { name: 'Freeze previous' })).toHaveCount(0)

    // Unfreeze so the deletion test below still has an unlocked row
    await page
      .locator('tbody tr[data-locked="true"]')
      .getByRole('button', { name: 'Unfreeze this reading' })
      .click()
    await confirmDialog(page, 'Unfreeze')
    await expect(page.locator('tbody tr[data-locked="true"]')).toHaveCount(0, { timeout: 10000 })
  })

  test('a reading can be deleted', async () => {
    await expect(page.locator('tbody tr')).toHaveCount(2)
    await page
      .locator('tbody tr')
      .first()
      .getByRole('button', { name: 'Delete this reading?' })
      .click()
    await confirmDialog(page, 'Delete reading')
    await expect(page.locator('tbody tr')).toHaveCount(1, { timeout: 10000 })
  })

  test('the dashboard reports the latest complete reading', async () => {
    await page.goto('/dashboard')
    await expect(page.getByText('Net worth')).toBeVisible()
    await expect(page.getByText('$30,230.00').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(new RegExp(BANK))).toBeVisible()
  })
})
