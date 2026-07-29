import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '#/db/index.js'
import { authMiddleware } from './middleware.js'

/**
 * The name shown around the app. `users.name` is Google's and gets rewritten on
 * every login, so an override has to live in `display_name`; clearing it falls
 * back to Google's without losing it in the meantime.
 */
export const updateDisplayName = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ display_name: z.string().max(120) }))
  .handler(async ({ data, context }) => {
    const trimmed = data.display_name.trim()
    // Empty means "stop overriding" rather than "my name is blank".
    const display_name = trimmed === '' ? null : trimmed

    await db.updateTable('users').set({ display_name }).where('id', '=', context.user.id).execute()

    return { display_name }
  })
