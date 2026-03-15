import { expect, loginIsolated } from "./fixtures";
import { test, type Page, type Locator, type BrowserContext } from "@playwright/test";
import { addMovement, deleteMovement } from "./helpers";

// Checkpoints share global state (only one active checkpoint at a time)
// so tests must run serially to avoid interference.
test.describe.configure({ mode: "serial" });

/** Helper: Create a checkpoint on a row by entering the actual balance */
async function createCheckpoint(
  page: Page,
  row: Locator,
  actualBalance: string,
) {
  // Open row actions menu and click Checkpoint.
  // Retry if ElectricSQL re-renders close the menu before we can click.
  for (let attempt = 0; attempt < 5; attempt++) {
    await row.getByRole("button").last().click({ force: true });

    const menuItem = page.getByRole("menuitem", { name: "Checkpoint" });
    const menuVisible = await menuItem
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    if (menuVisible) {
      await menuItem.click({ force: true });
      break;
    }

    await page.waitForTimeout(300);
  }

  // Fill actual balance in the popover
  await expect(page.getByText("Balance checkpoint")).toBeVisible({ timeout: 5000 });
  const input = page.getByPlaceholder("0.00");
  await input.fill(actualBalance);

  // Click Checkpoint button to confirm.
  // Use force:true because ElectricSQL sync can detach/re-render the popover.
  await page.getByRole("button", { name: "Checkpoint" }).click({ force: true });

  // Wait for the popover overlay to disappear
  await expect(page.getByText("Balance checkpoint")).not.toBeVisible();

  // Wait for the checkpoint divider to appear (ElectricSQL sync may take a moment).
  // If it doesn't appear within 5s, reload the page to force re-sync.
  try {
    await expect(page.getByText("Checkpointed")).toBeVisible({ timeout: 5000 });
  } catch {
    await page.reload();
    await expect(page.getByText("Checkpointed")).toBeVisible({ timeout: 15000 });
  }
}

/** Helper: Unfreeze by clicking the Unfreeze ConfirmButton (two clicks) */
async function unfreeze(page: Page) {
  // Click "Unfreeze" — ConfirmButton switches to "Sure?"
  // Use force:true because the divider is absolutely positioned with z-index
  await page.getByRole("button", { name: "Unfreeze" }).click({ force: true });

  // Wait for the ConfirmButton to switch to "Sure?" state.
  // Use data-confirm-delete selector — more stable than matching button text
  // because the ConfirmButton conditionally renders a different element.
  const sureBtn = page.locator("[data-confirm-delete]");
  await expect(sureBtn).toBeVisible({ timeout: 3000 });

  // Click "Sure?" with force:true to avoid interception by the absolutely
  // positioned divider. The ConfirmButton's useClickAwayDismiss attaches a
  // capture-phase handler on the same render — clicking too fast can race
  // with the handler attachment, so we wait for visibility first.
  await sureBtn.click({ force: true });

  // Wait for the checkpoint divider to disappear (ElectricSQL sync).
  // If it doesn't disappear, reload to force re-sync.
  try {
    await expect(page.getByText("Checkpointed")).not.toBeVisible({
      timeout: 10000,
    });
  } catch {
    await page.reload();
    await expect(page.getByText("Checkpointed")).not.toBeVisible({
      timeout: 15000,
    });
  }
}

test.describe("Checkpoints", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ({ context, page } = await loginIsolated(browser));
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    // ElectricSQL sync + checkpoint operations need extra time
    test.slow();
    await page.goto("/finances/movements");
    await expect(
      page.getByRole("heading", { name: "Movements" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add Movement" }),
    ).toBeVisible();

    // Clean up any leftover checkpoint from a previous failed run
    const unfreezeBtn = page.getByRole("button", { name: "Unfreeze" });
    if (await unfreezeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await unfreeze(page);
    }
  });

  test("can create a checkpoint on a movement", async () => {
    const desc = `CP-Create-${Date.now()}`;
    const row = await addMovement(page, desc, "100");

    // Create checkpoint with matching balance
    await createCheckpoint(page, row, "100");

    // Verify the divider shows Expected / Actual / Diff info
    await expect(page.getByText(/Expected:/)).toBeVisible();
    await expect(page.getByText(/Actual:/)).toBeVisible();
    await expect(page.getByText(/Diff:/)).toBeVisible();

    // Clean up: unfreeze then delete
    await unfreeze(page);
    await deleteMovement(page, row);
  });

  test("frozen movements cannot be edited", async () => {
    const desc = `CP-Frozen-${Date.now()}`;
    const row = await addMovement(page, desc, "250");

    await createCheckpoint(page, row, "250");

    // Frozen row cells have data-disabled attribute
    await expect(row.locator("[data-disabled]").first()).toBeVisible();

    // Try clicking the description cell — it should NOT enter edit mode
    await row.locator('[data-cell="description"]').click();
    await expect(row.getByRole("textbox")).not.toBeVisible();

    // Clean up: unfreeze then delete
    await unfreeze(page);
    await deleteMovement(page, row);
  });

  test("can unfreeze by deleting checkpoint", async () => {
    const desc = `CP-Unfreeze-${Date.now()}`;
    const row = await addMovement(page, desc, "300");

    await createCheckpoint(page, row, "300");

    // Verify frozen
    await expect(row.locator("[data-disabled]").first()).toBeVisible();

    // Unfreeze
    await unfreeze(page);

    // Verify the cell is now editable again (no data-disabled)
    await expect(row.locator("[data-disabled]")).not.toBeVisible();

    // Verify the row now has action button (not lock icon) — proves it's editable
    await expect(row.getByRole("button").last()).toBeVisible();

    // Clean up
    await deleteMovement(page, row);
  });

  test("new movements added after checkpoint are NOT frozen", async () => {
    // Add first movement and checkpoint it
    const frozenDesc = `CP-Before-${Date.now()}`;
    const frozenRow = await addMovement(page, frozenDesc, "400");
    await createCheckpoint(page, frozenRow, "400");

    // Add a new movement AFTER the checkpoint.
    // With a checkpoint active, the DOM has a divider that can interfere.
    // Click Add Movement, then reload to get a clean DOM, then find the new row.
    await page.getByRole("button", { name: "Add Movement" }).click();
    // Brief wait for the server to process before reload — unavoidable because
    // we need the insert to reach Postgres before we can reload and see it.
    await page.waitForTimeout(500);
    await page.reload();
    await expect(page.getByText("Checkpointed")).toBeVisible({ timeout: 10000 });

    // Find the new empty row (not frozen — has editable cells)
    const afterDesc = `CP-After-${Date.now()}`;
    const emptyDescCell = page
      .locator(
        '[data-cell="description"] [data-editable-cell]:not([data-disabled])',
      )
      .filter({ hasText: "—" })
      .last();
    await expect(emptyDescCell).toBeVisible({ timeout: 5000 });
    await emptyDescCell.click({ force: true });
    await page.waitForTimeout(200);
    await page.keyboard.type(afterDesc, { delay: 10 });
    await page.keyboard.press("Enter");

    const newRow = page.locator("[data-row-id]", {
      has: page.getByText(afterDesc, { exact: true }),
    });
    await expect(newRow).toBeVisible({ timeout: 10000 });

    // The new movement should NOT be frozen — no disabled cells
    await expect(newRow.locator("[data-disabled]")).not.toBeVisible();

    // Verify the new row has action button (not lock icon)
    await expect(newRow.getByRole("button").last()).toBeVisible();

    // Clean up: delete new movement first
    await deleteMovement(page, newRow);

    // Unfreeze and delete the frozen movement
    await unfreeze(page);
    await deleteMovement(page, frozenRow);
  });

  test("checkpoint popover shows expected total and difference", async () => {
    const desc = `CP-Popover-${Date.now()}`;
    const row = await addMovement(page, desc, "750");

    // Open the checkpoint popover
    await row.getByRole("button").last().click();
    await page.getByRole("menuitem", { name: "Checkpoint" }).click();

    // Verify popover elements
    await expect(page.getByText("Balance checkpoint")).toBeVisible();
    await expect(page.getByText("Expected total")).toBeVisible();

    // Fill a different amount to see the difference
    await page.getByPlaceholder("0.00").fill("800");

    // Verify difference is shown
    await expect(page.getByText("Difference")).toBeVisible();

    // Cancel instead of confirming
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Balance checkpoint")).not.toBeVisible();

    // Clean up
    await deleteMovement(page, row);
  });
});
