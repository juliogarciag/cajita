import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '#/db/index.js'
import { authMiddleware } from './middleware.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the number of days in a given month (1-indexed) */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/** Clamp day_of_month to the last valid day of the given month */
function clampDay(year: number, month: number, day: number): number {
  return Math.min(day, daysInMonth(year, month))
}

/** Format a date as YYYY-MM-DD */
function toISODate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Return the generation horizon: end of current year + 3 months (= March of next year) */
function getHorizon(): { year: number; month: number } {
  const now = new Date()
  return { year: now.getFullYear() + 1, month: 3 }
}

// ---------------------------------------------------------------------------
// generateRecurringMovements — idempotent, called on movements page load
// ---------------------------------------------------------------------------

export const generateRecurringMovements = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const teamId = context.user.teamId

    const templates = await db
      .selectFrom('recurring_movement_templates')
      .selectAll()
      .where('team_id', '=', teamId)
      .where('active', '=', true)
      .execute()

    if (templates.length === 0) return { generated: 0 }

    const horizon = getHorizon()
    let generated = 0

    for (const template of templates) {
      const startDate = new Date(template.start_date)
      const endDate = template.end_date ? new Date(template.end_date) : null

      // Start from the template's start month (but no earlier than today's month)
      const genStartYear = startDate.getFullYear()
      const genStartMonth = startDate.getMonth() + 1

      let year = genStartYear
      let month = genStartMonth

      while (
        year < horizon.year ||
        (year === horizon.year && month <= horizon.month)
      ) {
        // Respect end_date
        if (endDate) {
          const endYear = endDate.getFullYear()
          const endMonth = endDate.getMonth() + 1
          if (year > endYear || (year === endYear && month > endMonth)) break
        }

        const day = clampDay(year, month, template.day_of_month)
        const date = toISODate(year, month, day)
        const recurringPeriod = toISODate(year, month, 1) // always 1st of month

        // Get max sort_position for this date to append after existing movements
        const maxPos = await db
          .selectFrom('movements')
          .select(db.fn.max('sort_position').as('max_pos'))
          .where('date', '=', date)
          .where('team_id', '=', teamId)
          .executeTakeFirst()

        const sort_position = ((maxPos?.max_pos as number) ?? 0) + 1000

        // INSERT ... ON CONFLICT DO NOTHING (unique index on recurring_template_id + recurring_period)
        const result = await db
          .insertInto('movements')
          .values({
            team_id: teamId,
            description: template.description,
            date,
            amount_cents: template.amount_cents,
            category_id: template.category_id ?? null,
            sort_position,
            source: 'recurring',
            recurring_template_id: template.id,
            recurring_period: recurringPeriod,
            confirmed: false,
          })
          .onConflict((oc) => oc.doNothing())
          .returning('id')
          .executeTakeFirst()

        if (result) generated++

        // Advance to next month
        month++
        if (month > 12) {
          month = 1
          year++
        }
      }
    }

    return { generated }
  })

// ---------------------------------------------------------------------------
// confirmRecurringMovement
// ---------------------------------------------------------------------------

export const confirmRecurringMovement = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      movementId: z.string().uuid(),
      date: z.string().optional(),
      amountCents: z.number().int().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    const toSet: Record<string, unknown> = { confirmed: true, updated_at: new Date() }
    if (data.date !== undefined) toSet.date = data.date
    if (data.amountCents !== undefined) toSet.amount_cents = data.amountCents

    const movement = await db
      .updateTable('movements')
      .set(toSet)
      .where('id', '=', data.movementId)
      .where('team_id', '=', teamId)
      .where('source', '=', 'recurring')
      .where('confirmed', '=', false)
      .returningAll()
      .executeTakeFirstOrThrow()

    return { movement }
  })

// ---------------------------------------------------------------------------
// createRecurringTemplate
// ---------------------------------------------------------------------------

export const createRecurringTemplate = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      description: z.string().min(1).max(255),
      amount_cents: z.number().int(),
      category_id: z.string().uuid().nullable().optional(),
      day_of_month: z.number().int().min(1).max(31),
      start_date: z.string(), // YYYY-MM-DD
      end_date: z.string().nullable().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    const template = await db
      .insertInto('recurring_movement_templates')
      .values({
        team_id: teamId,
        description: data.description,
        amount_cents: data.amount_cents,
        category_id: data.category_id ?? null,
        day_of_month: data.day_of_month,
        start_date: data.start_date,
        end_date: data.end_date ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    return { template }
  })

// ---------------------------------------------------------------------------
// updateRecurringTemplate — cascades to unconfirmed future instances
// ---------------------------------------------------------------------------

export const updateRecurringTemplate = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      description: z.string().min(1).max(255).optional(),
      amount_cents: z.number().int().optional(),
      category_id: z.string().uuid().nullable().optional(),
      day_of_month: z.number().int().min(1).max(31).optional(),
      start_date: z.string().optional(),
      end_date: z.string().nullable().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    const { id, ...updates } = data
    const toSet: Record<string, unknown> = { updated_at: new Date() }

    if (updates.description !== undefined) toSet.description = updates.description
    if (updates.amount_cents !== undefined) toSet.amount_cents = updates.amount_cents
    if (updates.category_id !== undefined) toSet.category_id = updates.category_id
    if (updates.day_of_month !== undefined) toSet.day_of_month = updates.day_of_month
    if (updates.start_date !== undefined) toSet.start_date = updates.start_date
    if (updates.end_date !== undefined) toSet.end_date = updates.end_date

    const template = await db
      .updateTable('recurring_movement_templates')
      .set(toSet)
      .where('id', '=', id)
      .where('team_id', '=', teamId)
      .returningAll()
      .executeTakeFirstOrThrow()

    // Cascade description/amount changes to unconfirmed future instances
    const today = new Date().toISOString().slice(0, 10)
    const movementUpdates: Record<string, unknown> = { updated_at: new Date() }
    if (updates.description !== undefined) movementUpdates.description = updates.description
    if (updates.amount_cents !== undefined) movementUpdates.amount_cents = updates.amount_cents
    if (updates.category_id !== undefined) movementUpdates.category_id = updates.category_id

    if (Object.keys(movementUpdates).length > 1) {
      await db
        .updateTable('movements')
        .set(movementUpdates)
        .where('recurring_template_id', '=', id)
        .where('confirmed', '=', false)
        .where('date', '>=', today)
        .execute()
    }

    return { template }
  })

// ---------------------------------------------------------------------------
// deactivateRecurringTemplate
// ---------------------------------------------------------------------------

export const deactivateRecurringTemplate = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(z.object({ id: z.string().uuid(), active: z.boolean() }))
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    const template = await db
      .updateTable('recurring_movement_templates')
      .set({ active: data.active, updated_at: new Date() })
      .where('id', '=', data.id)
      .where('team_id', '=', teamId)
      .returningAll()
      .executeTakeFirstOrThrow()

    return { template }
  })

// ---------------------------------------------------------------------------
// deleteRecurringTemplate — blocked if confirmed instances exist
// ---------------------------------------------------------------------------

export const deleteRecurringTemplate = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    // Verify ownership
    await db
      .selectFrom('recurring_movement_templates')
      .select('id')
      .where('id', '=', data.id)
      .where('team_id', '=', teamId)
      .executeTakeFirstOrThrow()

    // Block if any confirmed instances exist
    const confirmed = await db
      .selectFrom('movements')
      .select(db.fn.count('id').as('count'))
      .where('recurring_template_id', '=', data.id)
      .where('confirmed', '=', true)
      .executeTakeFirstOrThrow()

    if (Number(confirmed.count) > 0) {
      throw new Error(
        `Cannot delete template: ${confirmed.count} confirmed movement(s) are linked to it. Deactivate it instead.`,
      )
    }

    // Delete unconfirmed future instances
    await db
      .deleteFrom('movements')
      .where('recurring_template_id', '=', data.id)
      .where('confirmed', '=', false)
      .execute()

    // Delete the template (recurring_template_id on confirmed movements is set to NULL via ON DELETE SET NULL)
    await db
      .deleteFrom('recurring_movement_templates')
      .where('id', '=', data.id)
      .where('team_id', '=', teamId)
      .execute()

    return { success: true }
  })

// ---------------------------------------------------------------------------
// getRecurringTemplates
// ---------------------------------------------------------------------------

export const getRecurringTemplates = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const teamId = context.user.teamId

    const templates = await db
      .selectFrom('recurring_movement_templates')
      .selectAll()
      .where('team_id', '=', teamId)
      .orderBy('created_at', 'asc')
      .execute()

    return { templates }
  })
