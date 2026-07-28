import { test, expect } from './fixtures'
import { createCategory, openCategory } from './helpers'

test.describe('Pinned categories', () => {
  test('pins from the list and unpins from the category page', async ({ page }) => {
    const name = `Pin-${Date.now()}`

    await page.goto('/finances/expense-categories')
    await createCategory(page, name)

    // Nothing is pinned to start, so the dashboard section is absent entirely
    await page.goto('/dashboard')
    await expect(page.getByText(/Expenses - \d{4}/)).toHaveCount(0)

    await page.goto('/finances/expense-categories')
    await page.getByRole('button', { name: `Pin ${name} to dashboard` }).click()
    await expect(page.getByText('Pinned to dashboard')).toBeVisible({ timeout: 10000 })

    await page.goto('/dashboard')
    await expect(page.getByText(/Expenses - \d{4}/)).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible()

    // The same toggle is on the category's own page, and agrees with the list
    await page.goto('/finances/expense-categories')
    await openCategory(page, name)
    await expect(page.getByRole('button', { name: 'Unpin from dashboard' })).toBeVisible()
    await page.getByRole('button', { name: 'Unpin from dashboard' }).click()
    await expect(page.getByText('Removed from dashboard')).toBeVisible({ timeout: 10000 })

    await page.goto('/dashboard')
    await expect(page.getByText(/Expenses - \d{4}/)).toHaveCount(0)
  })

  test('pinned cards can be reordered by dragging, and the order sticks', async ({ page }) => {
    const stamp = Date.now()
    // Prefixed so the starting order is alphabetical and therefore predictable
    const first = `AAA-${stamp}`
    const second = `ZZZ-${stamp}`

    await page.goto('/finances/expense-categories')
    await createCategory(page, first)
    await createCategory(page, second)
    await page.getByRole('button', { name: `Pin ${first} to dashboard` }).click()
    await page.getByRole('button', { name: `Pin ${second} to dashboard` }).click()

    await page.goto('/dashboard')
    const cards = page.locator('[data-pinned-category]')
    await expect(cards).toHaveCount(2, { timeout: 10000 })
    await expect(cards.first()).toContainText(first)

    // Drag the second card onto the first
    await cards.nth(1).dragTo(cards.nth(0))
    await expect(cards.first()).toContainText(second, { timeout: 10000 })

    // Stored, not just reordered in memory
    await page.reload()
    await expect(page.locator('[data-pinned-category]').first()).toContainText(second, {
      timeout: 10000,
    })
  })
})
