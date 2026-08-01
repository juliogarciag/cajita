import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '#/db/index.js'
import { authMiddleware } from './middleware.js'
import { formatMonth } from '#/lib/income-tax-year.js'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date')
const isoMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected a YYYY-MM month')

// A receipt with no money on it isn't a receipt, and a zero rate would make the
// soles amount meaningless. Both are required to be real.
const positiveCents = z.number().int().positive()
const positiveRate = z.number().positive().max(100)

export const createIncomeReceipt = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      income_date: isoDate,
      receipt_date: isoDate,
      description: z.string().max(255),
      company: z.string().max(255).optional(),
      receipt_number: z.string().max(64).optional(),
      amount_usd_cents: positiveCents,
      exchange_rate: positiveRate,
    }),
  )
  .handler(async ({ data, context }) => {
    const receipt = await db
      .insertInto('income_receipts')
      .values({
        team_id: context.user.teamId,
        income_date: data.income_date,
        receipt_date: data.receipt_date,
        description: data.description,
        company: data.company ?? '',
        receipt_number: data.receipt_number ?? '',
        amount_usd_cents: data.amount_usd_cents,
        exchange_rate: data.exchange_rate,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    return { receipt }
  })

export const updateIncomeReceipt = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.string().uuid(),
      income_date: isoDate.optional(),
      receipt_date: isoDate.optional(),
      description: z.string().max(255).optional(),
      company: z.string().max(255).optional(),
      receipt_number: z.string().max(64).optional(),
      amount_usd_cents: positiveCents.optional(),
      exchange_rate: positiveRate.optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { id, ...updates } = data
    const toSet: Record<string, unknown> = { updated_at: new Date() }

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) toSet[key] = value
    }

    const receipt = await db
      .updateTable('income_receipts')
      .set(toSet)
      .where('id', '=', id)
      .where('team_id', '=', context.user.teamId)
      .returningAll()
      .executeTakeFirstOrThrow()

    return { receipt }
  })

export const deleteIncomeReceipt = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    await db
      .deleteFrom('income_receipts')
      .where('id', '=', data.id)
      .where('team_id', '=', context.user.teamId)
      .execute()

    return { success: true }
  })

// --- Retentions ------------------------------------------------------------
// One row per declaration month, so the month is checked before inserting: the
// unique constraint would otherwise surface as a raw Postgres violation, and
// "July 2025 already has a retention" is the useful version of that.

export const createTaxRetention = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      month: isoMonth,
      amount_soles_cents: z.number().int(),
      amount_usd_cents: z.number().int().nullable().optional(),
      note: z.string().max(500).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId

    const existing = await db
      .selectFrom('tax_retentions')
      .select('id')
      .where('team_id', '=', teamId)
      .where('month', '=', data.month)
      .executeTakeFirst()

    if (existing) {
      throw new Error(`${formatMonth(data.month)} already has a retention. Edit that one instead.`)
    }

    const retention = await db
      .insertInto('tax_retentions')
      .values({
        team_id: teamId,
        month: data.month,
        amount_soles_cents: data.amount_soles_cents,
        amount_usd_cents: data.amount_usd_cents ?? null,
        note: data.note ?? '',
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    return { retention }
  })

export const updateTaxRetention = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.string().uuid(),
      month: isoMonth.optional(),
      amount_soles_cents: z.number().int().optional(),
      amount_usd_cents: z.number().int().nullable().optional(),
      note: z.string().max(500).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId
    const { id, ...updates } = data

    if (updates.month !== undefined) {
      const clash = await db
        .selectFrom('tax_retentions')
        .select('id')
        .where('team_id', '=', teamId)
        .where('month', '=', updates.month)
        .where('id', '!=', id)
        .executeTakeFirst()

      if (clash) {
        throw new Error(
          `${formatMonth(updates.month)} already has a retention. Edit that one instead.`,
        )
      }
    }

    const toSet: Record<string, unknown> = { updated_at: new Date() }
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) toSet[key] = value
    }

    const retention = await db
      .updateTable('tax_retentions')
      .set(toSet)
      .where('id', '=', id)
      .where('team_id', '=', teamId)
      .returningAll()
      .executeTakeFirstOrThrow()

    return { retention }
  })

export const deleteTaxRetention = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    await db
      .deleteFrom('tax_retentions')
      .where('id', '=', data.id)
      .where('team_id', '=', context.user.teamId)
      .execute()

    return { success: true }
  })

// --- Per-year settings -----------------------------------------------------

export const setTaxYearSettings = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      year: z.number().int().min(2000).max(2100),
      regularization_rate: z.number().positive().max(100).nullable().optional(),
      uit_override: z.number().int().positive().nullable().optional(),
      // Clearing the date is how a year goes back to unsettled, so null is a
      // meaningful value here rather than "leave alone" — that's `undefined`.
      regularization_paid_on: isoDate.nullable().optional(),
      regularization_paid_soles_cents: z.number().int().nullable().optional(),
      regularization_paid_usd_cents: z.number().int().nullable().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const teamId = context.user.teamId
    const { year, ...updates } = data

    const toSet: Record<string, unknown> = { updated_at: new Date() }
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) toSet[key] = value
    }

    const existing = await db
      .selectFrom('tax_years')
      .select('id')
      .where('team_id', '=', teamId)
      .where('year', '=', year)
      .executeTakeFirst()

    const row = existing
      ? await db
          .updateTable('tax_years')
          .set(toSet)
          .where('id', '=', existing.id)
          .returningAll()
          .executeTakeFirstOrThrow()
      : await db
          .insertInto('tax_years')
          .values({
            team_id: teamId,
            year,
            regularization_rate: updates.regularization_rate ?? null,
            uit_override: updates.uit_override ?? null,
            regularization_paid_on: updates.regularization_paid_on ?? null,
            regularization_paid_soles_cents: updates.regularization_paid_soles_cents ?? null,
            regularization_paid_usd_cents: updates.regularization_paid_usd_cents ?? null,
          })
          .returningAll()
          .executeTakeFirstOrThrow()

    return { taxYear: row }
  })
