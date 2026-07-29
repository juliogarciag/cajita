import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '#/db/index.js'
import { authMiddleware } from './middleware.js'

export const createExpenseItem = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      expense_category_id: z.string().uuid(),
      description: z.string().max(255),
      date: z.string(),
      amount_soles_cents: z.number().int().nullable().optional(),
      amount_usd_cents: z.number().int().nullable().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    // Verify category belongs to team
    await db
      .selectFrom('expense_categories')
      .select('id')
      .where('id', '=', data.expense_category_id)
      .where('team_id', '=', teamId)
      .executeTakeFirstOrThrow()

    const maxPos = await db
      .selectFrom('expense_items')
      .select(db.fn.max('sort_position').as('max_pos'))
      .where('expense_category_id', '=', data.expense_category_id)
      .executeTakeFirst()

    const sort_position = ((maxPos?.max_pos as number) ?? 0) + 1000

    const item = await db
      .insertInto('expense_items')
      .values({
        team_id: teamId,
        expense_category_id: data.expense_category_id,
        description: data.description,
        date: data.date,
        amount_soles_cents: data.amount_soles_cents ?? null,
        amount_usd_cents: data.amount_usd_cents ?? null,
        sort_position,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    return { item }
  })

export const updateExpenseItem = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.string().uuid(),
      description: z.string().max(255).optional(),
      date: z.string().optional(),
      amount_soles_cents: z.number().int().nullable().optional(),
      amount_usd_cents: z.number().int().nullable().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    const { id, ...updates } = data
    const toSet: Record<string, unknown> = { updated_at: new Date() }

    if (updates.description !== undefined) toSet.description = updates.description
    if (updates.date !== undefined) toSet.date = updates.date
    if (updates.amount_soles_cents !== undefined)
      toSet.amount_soles_cents = updates.amount_soles_cents
    if (updates.amount_usd_cents !== undefined) toSet.amount_usd_cents = updates.amount_usd_cents

    const item = await db
      .updateTable('expense_items')
      .set(toSet)
      .where('id', '=', id)
      .where('team_id', '=', teamId)
      .returningAll()
      .executeTakeFirstOrThrow()

    return { item }
  })

export const deleteExpenseItem = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    await db
      .deleteFrom('expense_items')
      .where('id', '=', data.id)
      .where('team_id', '=', teamId)
      .execute()

    return { success: true }
  })
