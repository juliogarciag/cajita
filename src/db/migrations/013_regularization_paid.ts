import type { Kysely } from 'kysely'

// Whether a year's regularization has actually been paid.
//
// Nothing recorded this before, so the summary asserted "still to pay" for every
// closed year — including the ones settled years ago.
//
// It lives on tax_years rather than tax_retentions on purpose. `retained` is an
// input to the tax calculation, and the regularization is what's left after that
// calculation. Logging the payment as a retention would inflate `retained`,
// which shrinks the computed regularization — the figure would creep toward zero
// as you recorded paying it. This has to sit outside the maths.
//
// The amount is stored, not just the date: what SUNAT's portal charges at
// filing time can differ from the computed figure once late interest and fees
// for earlier years are folded in, and the same rule applies here as everywhere
// else in this feature — the portal is the authority, we log what it said.

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('tax_years')
    // Null means "not settled yet". Its presence is what marks the year paid.
    .addColumn('regularization_paid_on', 'text')
    .execute()

  await db.schema
    .alterTable('tax_years')
    .addColumn('regularization_paid_soles_cents', 'integer')
    .execute()

  await db.schema
    .alterTable('tax_years')
    .addColumn('regularization_paid_usd_cents', 'integer')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('tax_years').dropColumn('regularization_paid_usd_cents').execute()
  await db.schema.alterTable('tax_years').dropColumn('regularization_paid_soles_cents').execute()
  await db.schema.alterTable('tax_years').dropColumn('regularization_paid_on').execute()
}
