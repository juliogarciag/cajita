import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '#/db/index.js'
import { authMiddleware } from './middleware.js'

export const createExpenseCategory = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      name: z.string().min(1).max(255),
      color: z.string(),
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
      color: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    const toSet: Record<string, unknown> = { updated_at: new Date() }
    if (data.name !== undefined) toSet.name = data.name
    if (data.color !== undefined) toSet.color = data.color

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

    // CASCADE deletes expense_items and their notes
    await db
      .deleteFrom('expense_categories')
      .where('id', '=', data.id)
      .where('team_id', '=', teamId)
      .execute()

    return { success: true }
  })
