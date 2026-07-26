import { test, expect } from './fixtures'
import { createCategory, openCategory, addExpense } from './helpers'

test.describe('Navigation & Settings', () => {
  test('unauthenticated user is redirected to login', async ({ browser }) => {
    // Create a fresh context with NO stored auth — explicitly clear storageState
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    })
    const page = await context.newPage()

    await page.goto('/dashboard')
    // The _authenticated layout redirects to "/" when no session cookie is present.
    await expect(page).toHaveURL('/', { timeout: 10000 })
    await context.close()
  })

  test('top nav links navigate correctly', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

    // Finances link → /finances/expense-categories
    await page.getByRole('link', { name: 'Finances' }).click()
    await expect(page).toHaveURL(/\/finances\/expense-categories/)

    // Dashboard link
    await page.getByRole('link', { name: 'Dashboard' }).click()
    await expect(page).toHaveURL(/\/dashboard/)

    // Tools link
    await page.getByRole('link', { name: 'Tools' }).click()
    await expect(page).toHaveURL(/\/tools/)

    // Cajita logo → dashboard
    await page.getByRole('link', { name: 'Cajita' }).click()
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('finances sub-nav links navigate correctly', async ({ page }) => {
    await page.goto('/finances/expense-categories')

    await expect(page.getByRole('heading', { name: 'Expense Categories' })).toBeVisible()

    await page.getByRole('link', { name: 'Settings' }).click()
    await expect(page).toHaveURL(/\/finances\/settings/)
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

    await page.getByRole('link', { name: 'Expense Categories' }).click()
    await expect(page).toHaveURL(/\/finances\/expense-categories/)
    await expect(page.getByRole('heading', { name: 'Expense Categories' })).toBeVisible()
  })

  test('shows logged-in user name', async ({ page }) => {
    await page.goto('/dashboard')
    // Isolated test users are named "Test User <id>"
    await expect(page.getByText(/Test User \w+/).first()).toBeVisible()
    await expect(page.getByText(/Welcome back, Test User \w+\./)).toBeVisible()
  })

  test('settings page can toggle date format', async ({ page }) => {
    // Create a category + expense so there's a date to verify format on
    await page.goto('/finances/expense-categories')
    const categoryName = `DateFmt-${Date.now()}`
    await createCategory(page, categoryName)
    await openCategory(page, categoryName)
    await addExpense(page, `DateFmtItem-${Date.now()}`)

    await page.goto('/finances/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

    // Two format buttons visible
    await expect(page.getByRole('button', { name: /DD\/MM\/YYYY/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /YYYY-MM-DD/ })).toBeVisible()

    // Click YYYY-MM-DD format
    await page.getByRole('button', { name: /YYYY-MM-DD/ }).click()

    // Navigate back to the category detail to verify the date format applied
    await page.goto('/finances/expense-categories')
    await openCategory(page, categoryName)
    await expect(page.locator('text=/\\d{4}-\\d{2}-\\d{2}/').first()).toBeVisible({
      timeout: 10000,
    })

    // Switch back to DD/MM/YYYY
    await page.goto('/finances/settings')
    await page.getByRole('button', { name: /DD\/MM\/YYYY/ }).click()

    await page.goto('/finances/expense-categories')
    await openCategory(page, categoryName)
    await expect(page.locator('text=/\\d{2}\\/\\d{2}\\/\\d{4}/').first()).toBeVisible({
      timeout: 10000,
    })
  })
})
