import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '#/db/index.js'
import { authMiddleware } from './middleware.js'

const DEFAULT_DATE_FORMAT = 'DD/MM/YYYY'

export const getPreferences = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const row = await db
      .selectFrom('user_preferences')
      .select(['date_format'])
      .where('user_id', '=', context.user.id)
      .executeTakeFirst()

    return {
      date_format: row?.date_format ?? DEFAULT_DATE_FORMAT,
    }
  })

export const updatePreferences = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      date_format: z.enum(['DD/MM/YYYY', 'YYYY-MM-DD']),
    }),
  )
  .handler(async ({ data, context }) => {
    const existing = await db
      .selectFrom('user_preferences')
      .select('id')
      .where('user_id', '=', context.user.id)
      .executeTakeFirst()

    if (existing) {
      await db
        .updateTable('user_preferences')
        .set({ date_format: data.date_format, updated_at: new Date() })
        .where('user_id', '=', context.user.id)
        .execute()
    } else {
      await db
        .insertInto('user_preferences')
        .values({
          user_id: context.user.id,
          date_format: data.date_format,
        })
        .execute()
    }

    return { date_format: data.date_format }
  })
