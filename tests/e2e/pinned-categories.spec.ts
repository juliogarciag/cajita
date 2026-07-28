import { test, expect } from './fixtures'
import { createCategory, openCategory } from './helpers'

test.describe('Pinned categories', () => {
  test('pins from the list and unpins from the category page', async ({ page }) => {
    const name = `Pin-${Date.now()}`

    await page.goto('/finances/expense-categories')
    await createCategory(page, name)

    // Nothing is pinned to start, so the dashboard section is absent entirely
    await page.goto('/dashboard')
    await expect(page.getByText(/Pinned categories/)).toHaveCount(0)

    await page.goto('/finances/expense-categories')
    await page.getByRole('button', { name: `Pin ${name} to dashboard` }).click()
    await expect(page.getByText('Pinned to dashboard')).toBeVisible({ timeout: 10000 })

    await page.goto('/dashboard')
    await expect(page.getByText(/Pinned categories/)).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible()

    // The same toggle is on the category's own page, and agrees with the list
    await page.goto('/finances/expense-categories')
    await openCategory(page, name)
    await expect(page.getByRole('button', { name: 'Unpin from dashboard' })).toBeVisible()
    await page.getByRole('button', { name: 'Unpin from dashboard' }).click()
    await expect(page.getByText('Removed from dashboard')).toBeVisible({ timeout: 10000 })

    await page.goto('/dashboard')
    await expect(page.getByText(/Pinned categories/)).toHaveCount(0)
  })
})
