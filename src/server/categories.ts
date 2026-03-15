import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '#/db/index.js'
import { authMiddleware } from './middleware.js'

// --- Server Functions ---

export const getCategories = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const teamId = context.user.teamId

    const categories = await db
      .selectFrom('categories')
      .selectAll()
      .where('team_id', '=', teamId)
      .orderBy('sort_order', 'asc')
      .execute()

    return { categories }
  })

export const createCategory = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      name: z.string().min(1).max(100),
      color: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

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
        color: data.color ?? '#6b7280',
        sort_order,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    return { category }
  })

export const updateCategory = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(100).optional(),
      color: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    // Check if budget-owned
    const existing = await db
      .selectFrom('categories')
      .select('budget_id')
      .where('id', '=', data.id)
      .where('team_id', '=', teamId)
      .executeTakeFirstOrThrow()

    if (existing.budget_id) {
      throw new Error('Cannot edit a budget-owned category. Edit the budget instead.')
    }

    const updates: Record<string, unknown> = {}
    if (data.name !== undefined) updates.name = data.name
    if (data.color !== undefined) updates.color = data.color

    const category = await db
      .updateTable('categories')
      .set(updates)
      .where('id', '=', data.id)
      .where('team_id', '=', teamId)
      .returningAll()
      .executeTakeFirstOrThrow()

    return { category }
  })

export const archiveCategory = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      archived: z.boolean(),
    }),
  )
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    const existing = await db
      .selectFrom('categories')
      .select('budget_id')
      .where('id', '=', data.id)
      .where('team_id', '=', teamId)
      .executeTakeFirstOrThrow()

    if (existing.budget_id) {
      throw new Error('Cannot archive a budget-owned category.')
    }

    const category = await db
      .updateTable('categories')
      .set({ archived: data.archived })
      .where('id', '=', data.id)
      .where('team_id', '=', teamId)
      .returningAll()
      .executeTakeFirstOrThrow()

    return { category }
  })

export const deleteCategory = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    // Check if budget-owned
    const existing = await db
      .selectFrom('categories')
      .select('budget_id')
      .where('id', '=', data.id)
      .where('team_id', '=', teamId)
      .executeTakeFirstOrThrow()

    if (existing.budget_id) {
      throw new Error('Cannot delete a budget-owned category. Delete the budget instead.')
    }

    await db.deleteFrom('categories').where('id', '=', data.id).where('team_id', '=', teamId).execute()

    return { success: true }
  })
