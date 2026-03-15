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
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    try {
      // Auto-create a category for this budget
      const maxOrder = await db
        .selectFrom('categories')
        .select(db.fn.max('sort_order').as('max_order'))
        .where('team_id', '=', teamId)
        .executeTakeFirst()

      const sort_order = ((maxOrder?.max_order as number) ?? 0) + 1

      const category = await db
        .insertInto('categories')
        .values({
          team_id: teamId,
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
        .where('team_id', '=', teamId)
        .executeTakeFirst()

      const sort_position = ((maxPos?.max_pos as number) ?? 0) + 1000
      const remainingCents = -data.annual_amount_cents

      const movement = await db
        .insertInto('movements')
        .values({
          team_id: teamId,
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
          team_id: teamId,
          category_id: category.id as string,
          name: data.name,
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('budgets_name_year_key')) {
        throw new Error(`A budget named "${data.name}" already exists for ${data.year}.`)
      }
      throw err
    }
  })

export const updateBudget = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      annual_amount_cents: z.number().int().min(0),
    }),
  )
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    const budget = await db
      .updateTable('budgets')
      .set({ annual_amount_cents: data.annual_amount_cents, updated_at: new Date() })
      .where('id', '=', data.id)
      .where('team_id', '=', teamId)
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
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

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
      .select(['remaining_movement_id', 'category_id'])
      .where('id', '=', data.id)
      .where('team_id', '=', teamId)
      .executeTakeFirstOrThrow()

    // Check if remaining movement is frozen
    if (budget.remaining_movement_id) {
      const { isMovementFrozen } = await import('./budget-helpers.js')
      if (await isMovementFrozen(budget.remaining_movement_id)) {
        throw new Error('Cannot delete budget: remaining movement is frozen.')
      }
    }

    // Check if category is budget-owned (save before deletion)
    const ownedCategory = await db
      .selectFrom('categories')
      .select('id')
      .where('id', '=', budget.category_id)
      .where('budget_id', '=', data.id)
      .executeTakeFirst()

    // Delete budget (CASCADE deletes budget_items)
    await db.deleteFrom('budgets').where('id', '=', data.id).where('team_id', '=', teamId).execute()

    // Delete the remaining movement
    if (budget.remaining_movement_id) {
      await db.deleteFrom('movements').where('id', '=', budget.remaining_movement_id).execute()
    }

    // Delete the budget-owned category
    if (ownedCategory) {
      await db.deleteFrom('categories').where('id', '=', ownedCategory.id).execute()
    }

    return { success: true }
  })
