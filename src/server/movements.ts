import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '#/db/index.js'
import { authMiddleware } from './middleware.js'

// --- Server Functions ---

export const getMovements = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async () => {
    const movements = await db
      .selectFrom('movements')
      .leftJoin('categories', 'categories.id', 'movements.category_id')
      .select([
        'movements.id',
        'movements.description',
        'movements.date',
        'movements.amount_cents',
        'movements.category_id',
        'movements.sort_position',
        'movements.created_at',
        'movements.updated_at',
        'categories.name as category_name',
        'categories.color as category_color',
      ])
      .orderBy('movements.date', 'asc')
      .orderBy('movements.sort_position', 'asc')
      .execute()

    return { movements }
  })

export const createMovement = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      description: z.string().min(1).max(255),
      date: z.string(),
      amount_cents: z.number().int().refine((n) => n !== 0, 'Amount cannot be zero'),
      category_id: z.string().uuid().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    // Get the next sort_position for this date
    const maxPos = await db
      .selectFrom('movements')
      .select(db.fn.max('sort_position').as('max_pos'))
      .where('date', '=', data.date)
      .executeTakeFirst()

    const sort_position = ((maxPos?.max_pos as number) ?? 0) + 1000

    const movement = await db
      .insertInto('movements')
      .values({
        description: data.description,
        date: data.date,
        amount_cents: data.amount_cents,
        category_id: data.category_id ?? null,
        sort_position,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    return { movement }
  })

export const updateMovement = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      description: z.string().min(1).max(255).optional(),
      date: z.string().optional(),
      amount_cents: z
        .number()
        .int()
        .refine((n) => n !== 0, 'Amount cannot be zero')
        .optional(),
      category_id: z.string().uuid().nullable().optional(),
      sort_position: z.number().int().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { id, ...updates } = data
    const toSet: Record<string, unknown> = { updated_at: new Date() }

    if (updates.description !== undefined) toSet.description = updates.description
    if (updates.date !== undefined) toSet.date = updates.date
    if (updates.amount_cents !== undefined) toSet.amount_cents = updates.amount_cents
    if (updates.category_id !== undefined) toSet.category_id = updates.category_id
    if (updates.sort_position !== undefined) toSet.sort_position = updates.sort_position

    const movement = await db
      .updateTable('movements')
      .set(toSet)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow()

    return { movement }
  })

export const deleteMovement = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    await db.deleteFrom('movements').where('id', '=', data.id).execute()
    return { success: true }
  })

export const rebalanceSortPositions = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(z.object({ date: z.string() }))
  .handler(async ({ data }) => {
    const movements = await db
      .selectFrom('movements')
      .select(['id'])
      .where('date', '=', data.date)
      .orderBy('sort_position', 'asc')
      .execute()

    for (let i = 0; i < movements.length; i++) {
      await db
        .updateTable('movements')
        .set({ sort_position: (i + 1) * 1000, updated_at: new Date() })
        .where('id', '=', movements[i].id)
        .execute()
    }

    return { success: true }
  })
