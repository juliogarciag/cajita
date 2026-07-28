import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '#/db/index.js'
import { authMiddleware } from './middleware.js'
import { HEX_COLOR } from './color-bookmarks.js'

/**
 * Persist the hand-arranged order of the pinned dashboard cards. Takes the
 * whole list rather than a moved-item delta: positions are only meaningful
 * relative to each other, and one statement per card keeps the write simple.
 */
export const reorderExpenseCategories = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(z.object({ ids: z.array(z.string().uuid()).max(100) }))
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    await db.transaction().execute(async (tx) => {
      for (const [index, id] of data.ids.entries()) {
        await tx
          .updateTable('expense_categories')
          .set({ sort_order: index, updated_at: new Date() })
          .where('id', '=', id)
          .where('team_id', '=', teamId)
          .execute()
      }
    })

    return { ok: true }
  })

export const createExpenseCategory = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      name: z.string().min(1).max(255),
      color: z.string().regex(HEX_COLOR),
    }),
  )
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    try {
      const category = await db
        .insertInto('expense_categories')
        .values({
          team_id: teamId,
          name: data.name,
          color: data.color,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      return { category }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('expense_categories_team_name_unique')) {
        throw new Error(`A category named "${data.name}" already exists.`)
      }
      throw err
    }
  })

export const updateExpenseCategory = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(255).optional(),
      color: z.string().regex(HEX_COLOR).optional(),
      pinned: z.boolean().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    const toSet: Record<string, unknown> = { updated_at: new Date() }
    if (data.name !== undefined) toSet.name = data.name
    if (data.color !== undefined) toSet.color = data.color
    if (data.pinned !== undefined) toSet.pinned = data.pinned

    try {
      const category = await db
        .updateTable('expense_categories')
        .set(toSet)
        .where('id', '=', data.id)
        .where('team_id', '=', teamId)
        .returningAll()
        .executeTakeFirstOrThrow()

      return { category }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('expense_categories_team_name_unique')) {
        throw new Error(`A category named "${data.name}" already exists.`)
      }
      throw err
    }
  })

export const deleteExpenseCategory = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    // Deleting cascades to items and their notes, so only allow it when the
    // category is empty — otherwise a stray click destroys years of expenses.
    const existingItem = await db
      .selectFrom('expense_items')
      .select('id')
      .where('expense_category_id', '=', data.id)
      .where('team_id', '=', teamId)
      .executeTakeFirst()

    if (existingItem) {
      throw new Error('Cannot delete a category that still has expenses.')
    }

    await db
      .deleteFrom('expense_categories')
      .where('id', '=', data.id)
      .where('team_id', '=', teamId)
      .execute()

    return { success: true }
  })
