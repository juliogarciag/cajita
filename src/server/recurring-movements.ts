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

    // Helper: insert one movement instance (idempotent via ON CONFLICT DO NOTHING)
    const insertInstance = async (
      template: (typeof templates)[number],
      date: string,
      recurringPeriod: string,
    ) => {
      const maxPos = await db
        .selectFrom('movements')
        .select(db.fn.max('sort_position').as('max_pos'))
        .where('date', '=', date)
        .where('team_id', '=', teamId)
        .executeTakeFirst()

      const sort_position = ((maxPos?.max_pos as number) ?? 0) + 1000

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

      return result
    }

    for (const template of templates) {
      const startDate = new Date(template.start_date)
      const endDateStr = template.end_date ?? null

      if (template.period_type === 'annual') {
        // Generate one instance per year
        const monthOfYear = template.month_of_year!
        let year = startDate.getFullYear()

        while (year <= horizon.year) {
          const day = clampDay(year, monthOfYear, template.day_of_month)
          const date = toISODate(year, monthOfYear, day)

          // Skip if before start_date
          if (date < template.start_date) { year++; continue }

          // Stop if after end_date
          if (endDateStr && date > endDateStr) break

          const recurringPeriod = toISODate(year, 1, 1) // YYYY-01-01

          const result = await insertInstance(template, date, recurringPeriod)
          if (result) generated++

          year++
        }
      } else {
        // Monthly: existing logic
        const genStartYear = startDate.getFullYear()
        const genStartMonth = startDate.getMonth() + 1

        let year = genStartYear
        let month = genStartMonth

        while (
          year < horizon.year ||
          (year === horizon.year && month <= horizon.month)
        ) {
          // Respect end_date
          if (endDateStr) {
            const endDate = new Date(endDateStr)
            const endYear = endDate.getFullYear()
            const endMonth = endDate.getMonth() + 1
            if (year > endYear || (year === endYear && month > endMonth)) break
          }

          const day = clampDay(year, month, template.day_of_month)
          const date = toISODate(year, month, day)
          const recurringPeriod = toISODate(year, month, 1)

          const result = await insertInstance(template, date, recurringPeriod)
          if (result) generated++

          month++
          if (month > 12) { month = 1; year++ }
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

    const existing = await db
      .selectFrom('movements')
      .select('date')
      .where('id', '=', data.movementId)
      .where('team_id', '=', teamId)
      .where('source', '=', 'recurring')
      .where('confirmed', '=', false)
      .executeTakeFirstOrThrow()

    const today = new Date().toISOString().slice(0, 10)
    if (existing.date > today) {
      throw new Error('Cannot confirm a future movement')
    }

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
    z
      .object({
        description: z.string().min(1).max(255),
        amount_cents: z.number().int(),
        category_id: z.string().uuid().nullable().optional(),
        period_type: z.enum(['monthly', 'annual']).default('monthly'),
        day_of_month: z.number().int().min(1).max(31),
        month_of_year: z.number().int().min(1).max(12).nullable().optional(),
        start_date: z.string(), // YYYY-MM-DD
        end_date: z.string().nullable().optional(),
      })
      .refine(
        (d) => d.period_type !== 'annual' || d.month_of_year != null,
        { message: 'month_of_year is required for annual templates', path: ['month_of_year'] },
      ),
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
        period_type: data.period_type,
        day_of_month: data.day_of_month,
        month_of_year: data.month_of_year ?? null,
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
      period_type: z.enum(['monthly', 'annual']).optional(),
      day_of_month: z.number().int().min(1).max(31).optional(),
      month_of_year: z.number().int().min(1).max(12).nullable().optional(),
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
    if (updates.period_type !== undefined) toSet.period_type = updates.period_type
    if (updates.day_of_month !== undefined) toSet.day_of_month = updates.day_of_month
    if (updates.month_of_year !== undefined) toSet.month_of_year = updates.month_of_year
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

    // When period_type changes, delete all unconfirmed future instances so they regenerate cleanly
    if (updates.period_type !== undefined) {
      await db
        .deleteFrom('movements')
        .where('recurring_template_id', '=', id)
        .where('confirmed', '=', false)
        .where('date', '>=', today)
        .execute()
    // Otherwise, delete unconfirmed future instances that fall after the new end_date
    } else if (updates.end_date) {
      await db
        .deleteFrom('movements')
        .where('recurring_template_id', '=', id)
        .where('confirmed', '=', false)
        .where('date', '>', updates.end_date)
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
