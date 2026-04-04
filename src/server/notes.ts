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

// --- Movement Notes ---

export const upsertMovementNote = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      movement_id: z.string().uuid(),
      content: z.string().max(10000),
    }),
  )
  .handler(async ({ data, context }) => {
    const userId = context.user.id
    const teamId = context.user.teamId

    // Verify movement belongs to team
    await db
      .selectFrom('movements')
      .select('id')
      .where('id', '=', data.movement_id)
      .where('team_id', '=', teamId)
      .executeTakeFirstOrThrow()

    // Upsert: set created_by_user_id only on INSERT, always update updated_by_user_id
    const note = await sql<{ id: string }>`
      INSERT INTO movement_notes (movement_id, team_id, content, created_by_user_id, updated_by_user_id)
      VALUES (
        ${data.movement_id},
        ${teamId},
        ${data.content},
        ${userId},
        ${userId}
      )
      ON CONFLICT (movement_id) DO UPDATE
        SET content = EXCLUDED.content,
            updated_by_user_id = ${userId},
            updated_at = now()
      RETURNING id
    `.execute(db)

    return { note: note.rows[0] }
  })

export const deleteMovementNote = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(z.object({ movement_id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    // Verify movement belongs to team before deleting its note
    await db
      .selectFrom('movements')
      .select('id')
      .where('id', '=', data.movement_id)
      .where('team_id', '=', teamId)
      .executeTakeFirstOrThrow()

    await db
      .deleteFrom('movement_notes')
      .where('movement_id', '=', data.movement_id)
      .execute()

    return { success: true }
  })

// --- Budget Item Notes ---

export const upsertBudgetItemNote = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      budget_item_id: z.string().uuid(),
      content: z.string().max(10000),
    }),
  )
  .handler(async ({ data, context }) => {
    const userId = context.user.id
    const teamId = context.user.teamId

    // Verify budget item belongs to team
    await db
      .selectFrom('budget_items')
      .innerJoin('budgets', 'budgets.id', 'budget_items.budget_id')
      .select('budget_items.id')
      .where('budget_items.id', '=', data.budget_item_id)
      .where('budgets.team_id', '=', teamId)
      .executeTakeFirstOrThrow()

    const note = await sql<{ id: string }>`
      INSERT INTO budget_item_notes (budget_item_id, team_id, content, created_by_user_id, updated_by_user_id)
      VALUES (
        ${data.budget_item_id},
        ${teamId},
        ${data.content},
        ${userId},
        ${userId}
      )
      ON CONFLICT (budget_item_id) DO UPDATE
        SET content = EXCLUDED.content,
            updated_by_user_id = ${userId},
            updated_at = now()
      RETURNING id
    `.execute(db)

    return { note: note.rows[0] }
  })

export const getMovementNotes = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const teamId = context.user.teamId
    return db
      .selectFrom('movement_notes')
      .selectAll()
      .where('team_id', '=', teamId)
      .execute()
  })

export const getBudgetItemNotes = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const teamId = context.user.teamId
    return db
      .selectFrom('budget_item_notes')
      .selectAll()
      .where('team_id', '=', teamId)
      .execute()
  })

export const deleteBudgetItemNote = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(z.object({ budget_item_id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    await db
      .selectFrom('budget_items')
      .innerJoin('budgets', 'budgets.id', 'budget_items.budget_id')
      .select('budget_items.id')
      .where('budget_items.id', '=', data.budget_item_id)
      .where('budgets.team_id', '=', teamId)
      .executeTakeFirstOrThrow()

    await db
      .deleteFrom('budget_item_notes')
      .where('budget_item_id', '=', data.budget_item_id)
      .execute()

    return { success: true }
  })
