import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '#/db/index.js'
import { authMiddleware } from './middleware.js'

export const getSnapshots = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async () => {
    const snapshots = await db
      .selectFrom('snapshots')
      .select(['id', 'name', 'type', 'pinned', 'created_at'])
      .orderBy('created_at', 'desc')
      .execute()

    return { snapshots }
  })

export const createSnapshot = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      name: z.string().max(255).optional(),
      type: z.enum(['automatic', 'manual']).default('manual'),
    }),
  )
  .handler(async ({ data }) => {
    const movements = await db
      .selectFrom('movements')
      .selectAll()
      .orderBy('date', 'asc')
      .orderBy('sort_position', 'asc')
      .execute()

    const snapshot = await db
      .insertInto('snapshots')
      .values({
        name: data.name ?? null,
        type: data.type,
        data: JSON.stringify(movements),
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    return { snapshot }
  })

export const pinSnapshot = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    await db
      .updateTable('snapshots')
      .set({ pinned: true })
      .where('id', '=', data.id)
      .execute()

    return { success: true }
  })

export const deleteSnapshot = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    // Only allow deleting unpinned auto snapshots
    const snapshot = await db
      .selectFrom('snapshots')
      .select(['type', 'pinned'])
      .where('id', '=', data.id)
      .executeTakeFirstOrThrow()

    if (snapshot.type === 'manual' || snapshot.pinned) {
      throw new Error('Cannot delete manual or pinned snapshots')
    }

    await db.deleteFrom('snapshots').where('id', '=', data.id).execute()
    return { success: true }
  })

export const getSnapshotData = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const snapshot = await db
      .selectFrom('snapshots')
      .select(['id', 'name', 'type', 'data', 'created_at'])
      .where('id', '=', data.id)
      .executeTakeFirstOrThrow()

    return { snapshot }
  })

export const restoreSnapshot = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    // Get the snapshot to restore
    const targetSnapshot = await db
      .selectFrom('snapshots')
      .select(['data'])
      .where('id', '=', data.id)
      .executeTakeFirstOrThrow()

    const snapshotMovements = (
      typeof targetSnapshot.data === 'string'
        ? JSON.parse(targetSnapshot.data)
        : targetSnapshot.data
    ) as Array<Record<string, unknown>>

    // Transactional restore
    await db.transaction().execute(async (trx) => {
      // 1. Create pre-restore backup
      const currentMovements = await trx
        .selectFrom('movements')
        .selectAll()
        .orderBy('date', 'asc')
        .orderBy('sort_position', 'asc')
        .execute()

      await trx
        .insertInto('snapshots')
        .values({
          name: 'Pre-restore backup',
          type: 'automatic',
          pinned: true,
          data: JSON.stringify(currentMovements),
        })
        .execute()

      // 2. Delete all current movements
      await trx.deleteFrom('movements').execute()

      // 3. Insert all movements from snapshot
      if (snapshotMovements.length > 0) {
        await trx
          .insertInto('movements')
          .values(
            snapshotMovements.map((m) => ({
              id: m.id as string,
              description: m.description as string,
              date: m.date as string,
              amount_cents: m.amount_cents as number,
              category_id: (m.category_id as string) ?? null,
              sort_position: m.sort_position as number,
              created_at: new Date(m.created_at as string),
              updated_at: new Date(m.updated_at as string),
            })),
          )
          .execute()
      }
    })

    return { success: true }
  })

export const ensureTodaySnapshot = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Check if auto snapshot exists for today
    const existing = await db
      .selectFrom('snapshots')
      .select(['id'])
      .where('type', '=', 'automatic')
      .where('created_at', '>=', today)
      .executeTakeFirst()

    if (existing) {
      return { created: false }
    }

    // Create today's auto snapshot
    const movements = await db
      .selectFrom('movements')
      .selectAll()
      .orderBy('date', 'asc')
      .orderBy('sort_position', 'asc')
      .execute()

    await db
      .insertInto('snapshots')
      .values({
        name: null,
        type: 'automatic',
        data: JSON.stringify(movements),
      })
      .execute()

    // Prune old unpinned auto snapshots (>90 days)
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 90)

    await db
      .deleteFrom('snapshots')
      .where('type', '=', 'automatic')
      .where('pinned', '=', false)
      .where('created_at', '<', cutoff)
      .execute()

    return { created: true }
  })
