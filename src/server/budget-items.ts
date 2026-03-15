import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '#/db/index.js'
import { authMiddleware } from './middleware.js'

export const createBudgetItem = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      budget_id: z.string().uuid(),
      description: z.string().max(255),
      date: z.string(),
      amount_local_cents: z.number().int().nullable().optional(),
      amount_cents: z.number().int(),
    }),
  )
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    // Verify budget belongs to team
    await db
      .selectFrom('budgets')
      .select('id')
      .where('id', '=', data.budget_id)
      .where('team_id', '=', teamId)
      .executeTakeFirstOrThrow()

    const maxPos = await db
      .selectFrom('budget_items')
      .select(db.fn.max('sort_position').as('max_pos'))
      .where('budget_id', '=', data.budget_id)
      .executeTakeFirst()

    const sort_position = ((maxPos?.max_pos as number) ?? 0) + 1000

    const item = await db
      .insertInto('budget_items')
      .values({
        budget_id: data.budget_id,
        description: data.description,
        date: data.date,
        amount_local_cents: data.amount_local_cents ?? null,
        amount_cents: data.amount_cents,
        sort_position,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    const { recalculateRemaining } = await import('./budget-helpers.js')
    await recalculateRemaining(data.budget_id)

    return { item }
  })

export const updateBudgetItem = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      description: z.string().max(255).optional(),
      date: z.string().optional(),
      amount_local_cents: z.number().int().nullable().optional(),
      amount_cents: z.number().int().optional(),
      accounting_date: z.string().nullable().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    const existing = await db
      .selectFrom('budget_items')
      .innerJoin('budgets', 'budgets.id', 'budget_items.budget_id')
      .selectAll('budget_items')
      .where('budget_items.id', '=', data.id)
      .where('budgets.team_id', '=', teamId)
      .executeTakeFirstOrThrow()

    // If synced and movement is frozen, block edit
    if (existing.movement_id) {
      const { isMovementFrozen } = await import('./budget-helpers.js')
      if (await isMovementFrozen(existing.movement_id)) {
        throw new Error('Cannot edit: linked movement is frozen')
      }
    }

    const { id, ...updates } = data
    const toSet: Record<string, unknown> = { updated_at: new Date() }

    if (updates.description !== undefined) toSet.description = updates.description
    if (updates.date !== undefined) toSet.date = updates.date
    if (updates.amount_local_cents !== undefined) toSet.amount_local_cents = updates.amount_local_cents
    if (updates.amount_cents !== undefined) toSet.amount_cents = updates.amount_cents
    if (updates.accounting_date !== undefined) toSet.accounting_date = updates.accounting_date

    const item = await db
      .updateTable('budget_items')
      .set(toSet)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow()

    // Auto-update linked movement if synced
    if (existing.movement_id) {
      const movUpdates: Record<string, unknown> = { updated_at: new Date() }
      if (updates.description !== undefined) movUpdates.description = updates.description
      if (updates.amount_cents !== undefined) movUpdates.amount_cents = updates.amount_cents
      if (updates.accounting_date !== undefined) movUpdates.date = updates.accounting_date

      await db
        .updateTable('movements')
        .set(movUpdates)
        .where('id', '=', existing.movement_id)
        .execute()
    }

    const { recalculateRemaining: recalcRemaining } = await import('./budget-helpers.js')
    await recalcRemaining(existing.budget_id)

    return { item }
  })

export const deleteBudgetItem = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    const item = await db
      .selectFrom('budget_items')
      .innerJoin('budgets', 'budgets.id', 'budget_items.budget_id')
      .selectAll('budget_items')
      .where('budget_items.id', '=', data.id)
      .where('budgets.team_id', '=', teamId)
      .executeTakeFirstOrThrow()

    // If synced and frozen, block delete
    if (item.movement_id) {
      const { isMovementFrozen: isFrozen } = await import('./budget-helpers.js')
      if (await isFrozen(item.movement_id)) {
        throw new Error('Cannot delete: linked movement is frozen')
      }
      // Delete linked movement
      await db.deleteFrom('movements').where('id', '=', item.movement_id).execute()
    }

    await db.deleteFrom('budget_items').where('id', '=', data.id).execute()

    const { recalculateRemaining: recalcRem } = await import('./budget-helpers.js')
    await recalcRem(item.budget_id)

    return { success: true }
  })

export const syncBudgetItem = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      accounting_date: z.string(),
    }),
  )
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    const item = await db
      .selectFrom('budget_items')
      .innerJoin('budgets', 'budgets.id', 'budget_items.budget_id')
      .selectAll('budget_items')
      .select('budgets.category_id as budget_category_id')
      .where('budget_items.id', '=', data.id)
      .where('budgets.team_id', '=', teamId)
      .executeTakeFirstOrThrow()

    if (item.movement_id) {
      throw new Error('Item is already synced')
    }

    if (item.amount_cents === 0) {
      throw new Error('USD amount is required before syncing')
    }

    // Create movement
    const maxPos = await db
      .selectFrom('movements')
      .select(db.fn.max('sort_position').as('max_pos'))
      .where('date', '=', data.accounting_date)
      .where('team_id', '=', teamId)
      .executeTakeFirst()

    const sort_position = ((maxPos?.max_pos as number) ?? 0) + 1000

    const movement = await db
      .insertInto('movements')
      .values({
        team_id: teamId,
        description: item.description,
        date: data.accounting_date,
        amount_cents: item.amount_cents,
        category_id: item.budget_category_id,
        sort_position,
        source: 'budget_sync',
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    // Link item to movement
    await db
      .updateTable('budget_items')
      .set({
        movement_id: movement.id as string,
        accounting_date: data.accounting_date,
        updated_at: new Date(),
      })
      .where('id', '=', data.id)
      .execute()

    return { movement }
  })

export const unsyncBudgetItem = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    const item = await db
      .selectFrom('budget_items')
      .innerJoin('budgets', 'budgets.id', 'budget_items.budget_id')
      .selectAll('budget_items')
      .where('budget_items.id', '=', data.id)
      .where('budgets.team_id', '=', teamId)
      .executeTakeFirstOrThrow()

    if (!item.movement_id) {
      throw new Error('Item is not synced')
    }

    const { isMovementFrozen: checkFrozen } = await import('./budget-helpers.js')
    if (await checkFrozen(item.movement_id)) {
      throw new Error('Cannot unsync: movement is frozen')
    }

    // Delete movement
    await db.deleteFrom('movements').where('id', '=', item.movement_id).execute()

    // Clear link
    await db
      .updateTable('budget_items')
      .set({ movement_id: null, updated_at: new Date() })
      .where('id', '=', data.id)
      .execute()

    return { success: true }
  })
