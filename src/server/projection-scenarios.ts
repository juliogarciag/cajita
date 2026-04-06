import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '#/db/index.js'
import { authMiddleware } from './middleware.js'

export const createProjectionScenario = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      name: z.string().min(1),
      script_id: z.string().min(1),
      inputs_json: z.string(), // pre-serialized JSON string
    }),
  )
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    const scenario = await db
      .insertInto('projection_scenarios')
      .values({
        team_id: teamId,
        name: data.name,
        script_id: data.script_id,
        inputs_json: data.inputs_json,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    return { scenario }
  })

export const updateProjectionScenario = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).optional(),
      inputs_json: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId
    const { id, ...patch } = data

    const scenario = await db
      .updateTable('projection_scenarios')
      .set({ ...patch, updated_at: new Date().toISOString() })
      .where('id', '=', id)
      .where('team_id', '=', teamId)
      .returningAll()
      .executeTakeFirstOrThrow()

    return { scenario }
  })

export const toggleProjectionScenario = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      active: z.boolean(),
    }),
  )
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    const scenario = await db
      .updateTable('projection_scenarios')
      .set({ active: data.active, updated_at: new Date().toISOString() })
      .where('id', '=', data.id)
      .where('team_id', '=', teamId)
      .returningAll()
      .executeTakeFirstOrThrow()

    return { scenario }
  })

export const deleteProjectionScenario = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    await db
      .deleteFrom('projection_scenarios')
      .where('id', '=', data.id)
      .where('team_id', '=', teamId)
      .execute()

    return { success: true }
  })
