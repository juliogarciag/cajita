import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '#/db/index.js'
import { authMiddleware } from './middleware.js'

export const createBudget = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      category_id: z.string().uuid(),
      year: z.number().int().min(2000).max(2100),
      annual_amount_cents: z.number().int().min(0),
    }),
  )
  .handler(async ({ data }) => {
    // Check uniqueness
    const existing = await db
      .selectFrom('budgets')
      .select('id')
      .where('category_id', '=', data.category_id)
      .where('year', '=', data.year)
      .executeTakeFirst()

    if (existing) {
      throw new Error('A budget already exists for this category and year')
    }

    // Get category name for the remaining movement description
    const category = await db
      .selectFrom('categories')
      .select('name')
      .where('id', '=', data.category_id)
      .executeTakeFirstOrThrow()

    // Create EOY remaining movement
    const eoyDate = `${data.year}-12-31`
    const maxPos = await db
      .selectFrom('movements')
      .select(db.fn.max('sort_position').as('max_pos'))
      .where('date', '=', eoyDate)
      .executeTakeFirst()

    const sort_position = ((maxPos?.max_pos as number) ?? 0) + 1000

    // Remaining starts as negative of the full budget (projected spending)
    const remainingCents = -data.annual_amount_cents

    const movement = await db
      .insertInto('movements')
      .values({
        description: `[Remaining] ${category.name}`,
        date: eoyDate,
        amount_cents: remainingCents,
        category_id: data.category_id,
        sort_position,
        source: 'budget_remaining',
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    // Create budget
    const budget = await db
      .insertInto('budgets')
      .values({
        category_id: data.category_id,
        year: data.year,
        annual_amount_cents: data.annual_amount_cents,
        remaining_movement_id: movement.id,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

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
      const { isMovementFrozen } = await import('./movements.js')
      for (const movId of movementIds) {
        if (await isMovementFrozen(movId)) {
          throw new Error('Cannot delete budget: some synced movements are frozen. Unfreeze first.')
        }
      }
    }

    // Delete budget (CASCADE deletes items), then clean up movements
    await db.deleteFrom('budgets').where('id', '=', data.id).execute()

    // Delete linked movements
    if (movementIds.length > 0) {
      await db.deleteFrom('movements').where('id', 'in', movementIds).execute()
    }

    return { success: true }
  })
