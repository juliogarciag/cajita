import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { sql } from 'kysely'
import { db } from '#/db/index.js'
import { authMiddleware } from './middleware.js'
import { defaultReadingLabel, sameMonth } from '#/lib/reading-label.js'

export const createBalanceSnapshot = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      date: z.string(),
      label: z.string().max(120).optional(),
      /** Amounts to record with the reading, so it can be created complete. */
      amounts: z
        .array(z.object({ wealth_source_id: z.string().uuid(), amount_usd_cents: z.number().int() }))
        .optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId
    let label = data.label?.trim()
    if (!label) {
      // Same helper the dialog previews with, so the placeholder is honest.
      const existing = await db
        .selectFrom('balance_snapshots')
        .select(['date', 'label'])
        .where('team_id', '=', teamId)
        .execute()
      label = defaultReadingLabel(
        data.date,
        existing.filter((e) => sameMonth(e.date, data.date)).map((e) => e.label),
      )
    }

    return await db.transaction().execute(async (tx) => {
      const snapshot = await tx
        .insertInto('balance_snapshots')
        .values({ team_id: teamId, date: data.date, label })
        .returningAll()
        .executeTakeFirstOrThrow()

      if (data.amounts?.length) {
        await tx
          .insertInto('balance_entries')
          .values(
            data.amounts.map((a) => ({
              team_id: teamId,
              balance_snapshot_id: snapshot.id,
              wealth_source_id: a.wealth_source_id,
              amount_usd_cents: a.amount_usd_cents,
            })),
          )
          .execute()
      }

      return { snapshot }
    })
  })

/** Loads a reading in the caller's team, refusing the write when it's frozen. */
async function requireUnlocked(id: string, teamId: string, action: string) {
  const snapshot = await db
    .selectFrom('balance_snapshots')
    .select(['id', 'locked'])
    .where('id', '=', id)
    .where('team_id', '=', teamId)
    .executeTakeFirstOrThrow()

  if (snapshot.locked) {
    throw new Error(`This reading is frozen. Unfreeze it before ${action}.`)
  }

  return snapshot
}

export const updateBalanceSnapshot = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      date: z.string().optional(),
      label: z.string().max(120).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId
    await requireUnlocked(data.id, teamId, 'changing it')

    const toSet: Record<string, unknown> = { updated_at: new Date() }
    if (data.date !== undefined) toSet.date = data.date
    if (data.label !== undefined) toSet.label = data.label.trim()

    const snapshot = await db
      .updateTable('balance_snapshots')
      .set(toSet)
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
    await requireUnlocked(data.id, teamId, 'deleting it')

    // Entries cascade — a reading is meaningless without its values
    await db
      .deleteFrom('balance_snapshots')
      .where('id', '=', data.id)
      .where('team_id', '=', teamId)
      .execute()

    return { success: true }
  })

export const setBalanceSnapshotLocked = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(z.object({ id: z.string().uuid(), locked: z.boolean() }))
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    const snapshot = await db
      .updateTable('balance_snapshots')
      .set({ locked: data.locked, updated_at: new Date() })
      .where('id', '=', data.id)
      .where('team_id', '=', teamId)
      .returningAll()
      .executeTakeFirstOrThrow()

    return { snapshot }
  })

/**
 * Freeze everything except the newest reading — the usual case, since the
 * sweep in progress is the only one still being edited.
 */
export const freezePreviousReadings = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const teamId = context.user.teamId

    const newest = await db
      .selectFrom('balance_snapshots')
      .select('id')
      .where('team_id', '=', teamId)
      .orderBy('date', 'desc')
      .orderBy('created_at', 'desc')
      .executeTakeFirst()

    if (!newest) return { frozen: 0 }

    const result = await db
      .updateTable('balance_snapshots')
      .set({ locked: true, updated_at: new Date() })
      .where('team_id', '=', teamId)
      .where('locked', '=', false)
      .where('id', '!=', newest.id)
      .executeTakeFirst()

    return { frozen: Number(result.numUpdatedRows ?? 0) }
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

    // Both sides must belong to the caller's team, and a frozen reading is
    // settled history — its values don't move
    await requireUnlocked(data.balance_snapshot_id, teamId, 'changing its balances')

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
