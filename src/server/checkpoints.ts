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
  .handler(async ({ data }) => {
    // Get the target movement
    const movement = await db
      .selectFrom('movements')
      .select(['id', 'date', 'sort_position'])
      .where('id', '=', data.movement_id)
      .executeTakeFirstOrThrow()

    // Compute expected_cents (running total up to and including this movement)
    const result = await db
      .selectFrom('movements')
      .select(db.fn.sum<number>('amount_cents').as('total'))
      .where((eb) =>
        eb.or([
          eb('date', '<', movement.date),
          eb.and([eb('date', '=', movement.date), eb('sort_position', '<=', movement.sort_position)]),
        ]),
      )
      .executeTakeFirstOrThrow()

    const expected_cents = Number(result.total) || 0

    const checkpoint = await db
      .insertInto('checkpoints')
      .values({
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
  .handler(async ({ data }) => {
    await db.deleteFrom('checkpoints').where('id', '=', data.id).execute()
    return { success: true }
  })
