import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '#/db/index.js'
import { authMiddleware } from './middleware.js'

export const createCheckpoint = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      movement_id: z.string().uuid(),
      actual_cents: z.number().int(),
    }),
  )
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    // Get the target movement (scoped to team)
    const movement = await db
      .selectFrom('movements')
      .select(['id', 'date', 'sort_position'])
      .where('id', '=', data.movement_id)
      .where('team_id', '=', teamId)
      .executeTakeFirstOrThrow()

    const today = new Date().toISOString().slice(0, 10)
    if (movement.date > today) {
      throw new Error('Cannot create a checkpoint on a future movement')
    }

    // Compute expected_cents (running total up to and including this movement).
    // Exclude unconfirmed recurring placeholders — they represent future estimates, not real money.
    const result = await db
      .selectFrom('movements')
      .select(db.fn.sum<number>('amount_cents').as('total'))
      .where('team_id', '=', teamId)
      .where((eb) =>
        eb.or([
          eb('date', '<', movement.date),
          eb.and([
            eb('date', '=', movement.date),
            eb('sort_position', '<=', movement.sort_position),
          ]),
        ]),
      )
      .where((eb) => eb.or([eb('source', '!=', 'recurring'), eb('confirmed', '=', true)]))
      .executeTakeFirstOrThrow()

    const expected_cents = Number(result.total) || 0

    const checkpoint = await db
      .insertInto('checkpoints')
      .values({
        team_id: teamId,
        movement_id: data.movement_id,
        expected_cents,
        actual_cents: data.actual_cents,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    return { checkpoint }
  })

export const deleteCheckpoint = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    await db
      .deleteFrom('checkpoints')
      .where('id', '=', data.id)
      .where('team_id', '=', teamId)
      .execute()
    return { success: true }
  })
