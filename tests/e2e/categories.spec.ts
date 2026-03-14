import { test, expect, type Page, type Locator } from "@playwright/test";

/**
 * Get the category row that contains the given name.
 * Uses the data-category-row attribute for stable targeting.
 */
function getCategoryRow(page: Page, name: string): Locator {
  return page.locator("[data-category-row]", {
    has: page.getByText(name, { exact: true }),
  });
}

/** Delete a category using the ConfirmButton (two clicks: × → Sure?) */
async function deleteCategory(page: Page, name: string) {
  await getCategoryRow(page, name).getByRole("button", { name: "×" }).click();
  await page.getByRole("button", { name: "Sure?" }).click();
}

test.describe("Categories CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/finances/categories");
    await expect(
      page.getByRole("heading", { name: "Categories" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add Category" }),
    ).toBeVisible();
  });

  test("can add a new category", async ({ page }) => {
    const categoryName = `Test-Category-${Date.now()}`;

    await page.getByRole("button", { name: "Add Category" }).click();
    await page
      .getByRole("textbox", { name: "Category name" })
      .fill(categoryName);
    await page.getByRole("button", { name: "Blue" }).click();
    await page.getByRole("button", { name: "Create" }).click();

    // Verify category appears
    await expect(page.getByText(categoryName, { exact: true })).toBeVisible();

    // Clean up
    await deleteCategory(page, categoryName);
    await expect(
      page.getByText(categoryName, { exact: true }),
    ).not.toBeVisible();
  });

  test("can edit a category name", async ({ page }) => {
    const categoryName = `Edit-Me-${Date.now()}`;
    const newName = `Edited-${Date.now()}`;

    // Create
    await page.getByRole("button", { name: "Add Category" }).click();
    await page
      .getByRole("textbox", { name: "Category name" })
      .fill(categoryName);
    await page.getByRole("button", { name: "Blue" }).click();
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText(categoryName, { exact: true })).toBeVisible();

    // Edit
    await getCategoryRow(page, categoryName)
      .getByRole("button", { name: "Edit" })
      .click();
    const textbox = page.getByRole("textbox");
    await textbox.clear();
    await textbox.fill(newName);
    await page.getByRole("button", { name: "Save" }).click();

    // Verify
    await expect(page.getByText(newName, { exact: true })).toBeVisible();
    await expect(
      page.getByText(categoryName, { exact: true }),
    ).not.toBeVisible();

    // Clean up
    await deleteCategory(page, newName);
  });

  test("can archive and unarchive a category", async ({ page }) => {
    const categoryName = `Archive-Me-${Date.now()}`;

    // Create
    await page.getByRole("button", { name: "Add Category" }).click();
    await page
      .getByRole("textbox", { name: "Category name" })
      .fill(categoryName);
    await page.getByRole("button", { name: "Green" }).click();
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText(categoryName, { exact: true })).toBeVisible();

    // Archive
    await getCategoryRow(page, categoryName)
      .getByRole("button", { name: "Archive" })
      .click();

    // Should disappear from main list
    await expect(
      page.getByText(categoryName, { exact: true }),
    ).not.toBeVisible();

    // Show archived
    await page.getByRole("checkbox").check();
    await expect(page.getByText(categoryName, { exact: true })).toBeVisible();

    // Unarchive
    await getCategoryRow(page, categoryName)
      .getByRole("button", { name: "Unarchive" })
      .click();

    // After unarchiving, if there are no more archived categories,
    // the checkbox may disappear. The category should now be visible
    // in the main list regardless.
    await expect(page.getByText(categoryName, { exact: true })).toBeVisible();

    // Clean up
    await deleteCategory(page, categoryName);
  });

  test("can delete a category", async ({ page }) => {
    const categoryName = `Delete-Me-${Date.now()}`;

    // Create
    await page.getByRole("button", { name: "Add Category" }).click();
    await page
      .getByRole("textbox", { name: "Category name" })
      .fill(categoryName);
    await page.getByRole("button", { name: "Purple" }).click();
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText(categoryName, { exact: true })).toBeVisible();

    // Delete with confirmation
    await deleteCategory(page, categoryName);

    // Verify gone
    await expect(
      page.getByText(categoryName, { exact: true }),
    ).not.toBeVisible();
  });
});
