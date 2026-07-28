import { test, expect } from './fixtures'
import { createCategory, openCategory, addExpense, openUserMenu } from './helpers'

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

    // The logo is the only way back to the dashboard — there's no nav item
    await expect(page.locator('nav').getByRole('link', { name: 'Dashboard' })).toHaveCount(0)

    // There's no Finances grouping any more — its pages are top-level
    await expect(page.locator('nav').getByRole('link', { name: 'Finances' })).toHaveCount(0)

    await page.getByRole('link', { name: 'Expenses' }).click()
    await expect(page).toHaveURL(/\/finances\/expense-categories/)
    await expect(page.getByRole('heading', { name: 'Expense categories' })).toBeVisible()

    await page.getByRole('link', { name: 'Balances' }).click()
    await expect(page).toHaveURL(/\/finances\/net-worth/)
    await expect(page.getByRole('heading', { name: 'Balances' })).toBeVisible()

    await page.getByRole('link', { name: 'Toys' }).click()
    await expect(page).toHaveURL(/\/toys/)

    // Cajita logo → dashboard
    await page.getByRole('link', { name: 'Cajita' }).click()
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('the nav is the same on every page — no second bar', async ({ page }) => {
    const navLinks = () => page.locator('nav').getByRole('link')
    await page.goto('/finances/expense-categories')
    const onCategories = await navLinks().allInnerTexts()

    await page.goto('/dashboard')
    expect(await navLinks().allInnerTexts()).toEqual(onCategories)

    // Balances before Expenses before Toys, after the logo
    expect(onCategories).toEqual(['Cajita', 'Balances', 'Expenses', 'Toys'])
  })

  test('settings lives in the user menu, not the nav', async ({ page }) => {
    await page.goto('/finances/expense-categories')

    await expect(page.locator('nav').getByRole('link', { name: 'Settings' })).toHaveCount(0)

    await openUserMenu(page)
    await page.getByRole('menuitem', { name: 'Settings' }).click()

    await expect(page).toHaveURL(/\/settings/)
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  })

  test('the user menu can log out', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

    await openUserMenu(page)
    await page.getByRole('menuitem', { name: 'Logout' }).click()

    await expect(page).toHaveURL(/\/$/, { timeout: 10000 })
    // Genuinely signed out, not just redirected
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/$/, { timeout: 10000 })
  })

  test('display name overrides the google name and can be cleared', async ({ page }) => {
    await page.goto('/settings')
    const input = page.getByLabel('Display name')
    await expect(input).toBeVisible()

    // The placeholder is the Google name, which is what we should fall back to
    const googleName = await input.getAttribute('placeholder')
    const header = page.locator('nav').getByRole('button', { name: /./ }).last()

    await input.fill('Overridden Name')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(header).toHaveText(/Overridden Name/, { timeout: 10000 })

    // The override survives a reload — it's stored, not just in memory
    await page.reload()
    await expect(header).toHaveText(/Overridden Name/, { timeout: 10000 })

    // Emptying the field means "stop overriding", not "my name is blank"
    await page.getByLabel('Display name').fill('')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(header).toHaveText(new RegExp(googleName!), { timeout: 10000 })
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

    await page.goto('/settings')
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
    await page.goto('/settings')
    await page.getByRole('button', { name: /DD\/MM\/YYYY/ }).click()

    await page.goto('/finances/expense-categories')
    await openCategory(page, categoryName)
    await expect(page.locator('text=/\\d{2}\\/\\d{2}\\/\\d{4}/').first()).toBeVisible({
      timeout: 10000,
    })
  })
})
