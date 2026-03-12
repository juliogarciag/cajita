import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '#/db/index.js'
import { authMiddleware } from './middleware.js'

export const createBudget = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      name: z.string().min(1),
      color: z.string(),
      year: z.number().int().min(2000).max(2100),
      annual_amount_cents: z.number().int().min(0),
    }),
  )
  .handler(async ({ data }) => {
    // Auto-create a category for this budget
    const maxOrder = await db
      .selectFrom('categories')
      .select(db.fn.max('sort_order').as('max_order'))
      .executeTakeFirst()

    const sort_order = ((maxOrder?.max_order as number) ?? 0) + 1

    const category = await db
      .insertInto('categories')
      .values({
        name: data.name,
        color: data.color,
        sort_order,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    // Create EOY remaining movement
    const eoyDate = `${data.year}-12-31`
    const maxPos = await db
      .selectFrom('movements')
      .select(db.fn.max('sort_position').as('max_pos'))
      .where('date', '=', eoyDate)
      .executeTakeFirst()

    const sort_position = ((maxPos?.max_pos as number) ?? 0) + 1000
    const remainingCents = -data.annual_amount_cents

    const movement = await db
      .insertInto('movements')
      .values({
        description: `[Remaining] ${data.name}`,
        date: eoyDate,
        amount_cents: remainingCents,
        category_id: category.id,
        sort_position,
        source: 'budget_remaining',
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    // Create budget
    const budget = await db
      .insertInto('budgets')
      .values({
        category_id: category.id as string,
        name: data.name,
        color: data.color,
        year: data.year,
        annual_amount_cents: data.annual_amount_cents,
        remaining_movement_id: movement.id,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    // Link category back to budget
    await db
      .updateTable('categories')
      .set({ budget_id: budget.id as string })
      .where('id', '=', category.id as string)
      .execute()

    return { budget }
  })

export const updateBudget = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      annual_amount_cents: z.number().int().min(0),
    }),
  )
  .handler(async ({ data }) => {
    const budget = await db
      .updateTable('budgets')
      .set({ annual_amount_cents: data.annual_amount_cents, updated_at: new Date() })
      .where('id', '=', data.id)
      .returningAll()
      .executeTakeFirstOrThrow()

    // Recalculate remaining
    const { recalculateRemaining } = await import('./budget-helpers.js')
    await recalculateRemaining(budget.id as string)

    return { budget }
  })

export const deleteBudget = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    // Get all synced movement IDs for this budget
    const syncedItems = await db
      .selectFrom('budget_items')
      .select('movement_id')
      .where('budget_id', '=', data.id)
      .where('movement_id', 'is not', null)
      .execute()

    if (syncedItems.length > 0) {
      throw new Error('Cannot delete budget: unsync all items first.')
    }

    const budget = await db
      .selectFrom('budgets')
      .select('remaining_movement_id')
      .where('id', '=', data.id)
      .executeTakeFirstOrThrow()

    // Collect all movement IDs to check/delete
    const movementIds = syncedItems
      .map((i) => i.movement_id)
      .filter((id): id is string => id !== null)

    if (budget.remaining_movement_id) {
      movementIds.push(budget.remaining_movement_id)
    }

    // Check if any are frozen
    if (movementIds.length > 0) {
      const { isMovementFrozen } = await import('./budget-helpers.js')
      for (const movId of movementIds) {
        if (await isMovementFrozen(movId)) {
          throw new Error('Cannot delete budget: some synced movements are frozen. Unfreeze first.')
        }
      }
    }

    // Get the budget's category_id and check if it's budget-owned
    const fullBudget = await db
      .selectFrom('budgets')
      .select('category_id')
      .where('id', '=', data.id)
      .executeTakeFirstOrThrow()

    const ownedCategory = await db
      .selectFrom('categories')
      .select('id')
      .where('id', '=', fullBudget.category_id)
      .where('budget_id', '=', data.id)
      .executeTakeFirst()

    // Delete budget (CASCADE deletes items), then clean up movements
    await db.deleteFrom('budgets').where('id', '=', data.id).execute()

    // Delete linked movements
    if (movementIds.length > 0) {
      await db.deleteFrom('movements').where('id', 'in', movementIds).execute()
    }

    // Delete the budget-owned category if it exists
    // (must happen after budget deletion since budgets.category_id has onDelete('restrict'))
    // (budget_id was set to null by onDelete('set null'), so we use the id we saved)
    if (ownedCategory) {
      await db.deleteFrom('categories').where('id', '=', ownedCategory.id).execute()
    }

    return { success: true }
  })
