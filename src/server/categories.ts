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
