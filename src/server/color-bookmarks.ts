import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '#/db/index.js'
import { authMiddleware } from './middleware.js'

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

export const addColorBookmark = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ color: z.string().regex(HEX_COLOR) }))
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId
    const color = data.color.toLowerCase()

    const maxOrder = await db
      .selectFrom('color_bookmarks')
      .select(db.fn.max('sort_order').as('max_order'))
      .where('team_id', '=', teamId)
      .executeTakeFirst()

    const bookmark = await db
      .insertInto('color_bookmarks')
      .values({
        team_id: teamId,
        color,
        sort_order: ((maxOrder?.max_order as number) ?? 0) + 10,
      })
      .onConflict((oc) => oc.columns(['team_id', 'color']).doNothing())
      .returningAll()
      .executeTakeFirst()

    return { bookmark: bookmark ?? null }
  })

export const deleteColorBookmark = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    // Categories store their own color, so removing a bookmark never changes
    // how anything looks — it just drops it from the palette.
    await db
      .deleteFrom('color_bookmarks')
      .where('id', '=', data.id)
      .where('team_id', '=', teamId)
      .execute()

    return { success: true }
  })
