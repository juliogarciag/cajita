import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '#/db/index.js'
import { authMiddleware } from './middleware.js'

// --- Server Functions ---

export const getCategories = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async () => {
    const categories = await db
      .selectFrom('categories')
      .selectAll()
      .orderBy('sort_order', 'asc')
      .execute()

    return { categories }
  })

export const createCategory = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      name: z.string().min(1).max(100),
      color: z.string().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const maxOrder = await db
      .selectFrom('categories')
      .select(db.fn.max('sort_order').as('max_order'))
      .executeTakeFirst()

    const sort_order = ((maxOrder?.max_order as number) ?? 0) + 1

    const category = await db
      .insertInto('categories')
      .values({
        name: data.name,
        color: data.color ?? null,
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
      color: z.string().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    // Check if budget-owned
    const existing = await db
      .selectFrom('categories')
      .select('budget_id')
      .where('id', '=', data.id)
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
      .returningAll()
      .executeTakeFirstOrThrow()

    return { category }
  })

export const deleteCategory = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    // Check if budget-owned
    const existing = await db
      .selectFrom('categories')
      .select('budget_id')
      .where('id', '=', data.id)
      .executeTakeFirstOrThrow()

    if (existing.budget_id) {
      throw new Error('Cannot delete a budget-owned category. Delete the budget instead.')
    }

    await db.deleteFrom('categories').where('id', '=', data.id).execute()

    return { success: true }
  })
