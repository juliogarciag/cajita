import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { sql } from 'kysely'
import { db } from '#/db/index.js'
import { authMiddleware } from './middleware.js'

// --- Team Members (one-time fetch, no Electric long-poll) ---

export const getTeamMembers = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const teamId = context.user.teamId
    const rows = await db
      .selectFrom('team_memberships')
      .innerJoin('users', 'users.id', 'team_memberships.user_id')
      .select(['users.id', 'users.name'])
      .where('team_memberships.team_id', '=', teamId)
      .execute()
    return rows
  })

// --- Expense Item Notes ---

export const upsertExpenseItemNote = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      expense_item_id: z.string().uuid(),
      content: z.string().max(10000),
    }),
  )
  .handler(async ({ data, context }) => {
    const userId = context.user.id
    const teamId = context.user.teamId

    // Verify item belongs to team
    await db
      .selectFrom('expense_items')
      .select('id')
      .where('id', '=', data.expense_item_id)
      .where('team_id', '=', teamId)
      .executeTakeFirstOrThrow()

    // Upsert: set created_by_user_id only on INSERT, always update updated_by_user_id
    const note = await sql<{ id: string }>`
      INSERT INTO expense_item_notes (expense_item_id, team_id, content, created_by_user_id, updated_by_user_id)
      VALUES (
        ${data.expense_item_id},
        ${teamId},
        ${data.content},
        ${userId},
        ${userId}
      )
      ON CONFLICT (expense_item_id) DO UPDATE
        SET content = EXCLUDED.content,
            updated_by_user_id = ${userId},
            updated_at = now()
      RETURNING id
    `.execute(db)

    return { note: note.rows[0] }
  })

export const deleteExpenseItemNote = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(z.object({ expense_item_id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    await db
      .selectFrom('expense_items')
      .select('id')
      .where('id', '=', data.expense_item_id)
      .where('team_id', '=', teamId)
      .executeTakeFirstOrThrow()

    await db
      .deleteFrom('expense_item_notes')
      .where('expense_item_id', '=', data.expense_item_id)
      .execute()

    return { success: true }
  })
