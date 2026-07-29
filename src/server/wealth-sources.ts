import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '#/db/index.js'
import { authMiddleware } from './middleware.js'
import { HEX_COLOR } from './color-bookmarks.js'
import { WEALTH_KINDS } from '#/lib/wealth-kinds.js'

const KIND = z.enum(WEALTH_KINDS.map((k) => k.key) as [string, ...string[]])

export const createWealthSource = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      name: z.string().min(1).max(255),
      color: z.string().regex(HEX_COLOR),
      kind: KIND.optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    const maxOrder = await db
      .selectFrom('wealth_sources')
      .select(db.fn.max('sort_order').as('max_order'))
      .where('team_id', '=', teamId)
      .executeTakeFirst()

    try {
      const source = await db
        .insertInto('wealth_sources')
        .values({
          team_id: teamId,
          name: data.name,
          color: data.color,
          kind: data.kind ?? 'cash',
          sort_order: ((maxOrder?.max_order as number) ?? 0) + 10,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      return { source }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('wealth_sources_team_name_unique')) {
        throw new Error(`A source named "${data.name}" already exists.`)
      }
      throw err
    }
  })

export const updateWealthSource = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(255).optional(),
      color: z.string().regex(HEX_COLOR).optional(),
      kind: KIND.optional(),
      archived: z.boolean().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    const toSet: Record<string, unknown> = { updated_at: new Date() }
    if (data.name !== undefined) toSet.name = data.name
    if (data.color !== undefined) toSet.color = data.color
    if (data.kind !== undefined) toSet.kind = data.kind
    if (data.archived !== undefined) toSet.archived = data.archived

    try {
      const source = await db
        .updateTable('wealth_sources')
        .set(toSet)
        .where('id', '=', data.id)
        .where('team_id', '=', teamId)
        .returningAll()
        .executeTakeFirstOrThrow()

      return { source }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('wealth_sources_team_name_unique')) {
        throw new Error(`A source named "${data.name}" already exists.`)
      }
      throw err
    }
  })

export const deleteWealthSource = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    // Deleting drops the source out of every past reading, silently changing
    // historical totals. Archiving is the intended move once there's history.
    const existingEntry = await db
      .selectFrom('balance_entries')
      .select('id')
      .where('wealth_source_id', '=', data.id)
      .where('team_id', '=', teamId)
      .executeTakeFirst()

    if (existingEntry) {
      throw new Error('Cannot delete a source with recorded balances. Archive it instead.')
    }

    await db
      .deleteFrom('wealth_sources')
      .where('id', '=', data.id)
      .where('team_id', '=', teamId)
      .execute()

    return { success: true }
  })
