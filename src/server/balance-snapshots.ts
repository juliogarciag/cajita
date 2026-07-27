import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { sql } from 'kysely'
import { db } from '#/db/index.js'
import { authMiddleware } from './middleware.js'

export const createBalanceSnapshot = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(z.object({ date: z.string() }))
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    const snapshot = await db
      .insertInto('balance_snapshots')
      .values({ team_id: teamId, date: data.date })
      .returningAll()
      .executeTakeFirstOrThrow()

    return { snapshot }
  })

export const updateBalanceSnapshot = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(z.object({ id: z.string().uuid(), date: z.string() }))
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    const snapshot = await db
      .updateTable('balance_snapshots')
      .set({ date: data.date, updated_at: new Date() })
      .where('id', '=', data.id)
      .where('team_id', '=', teamId)
      .returningAll()
      .executeTakeFirstOrThrow()

    return { snapshot }
  })

export const deleteBalanceSnapshot = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    // Entries cascade — a reading is meaningless without its values
    await db
      .deleteFrom('balance_snapshots')
      .where('id', '=', data.id)
      .where('team_id', '=', teamId)
      .execute()

    return { success: true }
  })

// Writing a value creates or replaces the entry; clearing it removes the row,
// which is what makes a cell "not filled in" as opposed to zero.
export const setBalanceEntry = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      balance_snapshot_id: z.string().uuid(),
      wealth_source_id: z.string().uuid(),
      amount_usd_cents: z.number().int().nullable(),
    }),
  )
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    // Both sides must belong to the caller's team
    await db
      .selectFrom('balance_snapshots')
      .select('id')
      .where('id', '=', data.balance_snapshot_id)
      .where('team_id', '=', teamId)
      .executeTakeFirstOrThrow()

    await db
      .selectFrom('wealth_sources')
      .select('id')
      .where('id', '=', data.wealth_source_id)
      .where('team_id', '=', teamId)
      .executeTakeFirstOrThrow()

    if (data.amount_usd_cents === null) {
      await db
        .deleteFrom('balance_entries')
        .where('balance_snapshot_id', '=', data.balance_snapshot_id)
        .where('wealth_source_id', '=', data.wealth_source_id)
        .execute()

      return { entry: null }
    }

    const entry = await sql<{ id: string }>`
      INSERT INTO balance_entries (team_id, balance_snapshot_id, wealth_source_id, amount_usd_cents)
      VALUES (
        ${teamId},
        ${data.balance_snapshot_id},
        ${data.wealth_source_id},
        ${data.amount_usd_cents}
      )
      ON CONFLICT (balance_snapshot_id, wealth_source_id) DO UPDATE
        SET amount_usd_cents = EXCLUDED.amount_usd_cents,
            updated_at = now()
      RETURNING id
    `.execute(db)

    return { entry: entry.rows[0] }
  })
