import { sql, type Kysely } from 'kysely'

// Fourth-category income tax, replacing the Google Sheet.
//
// Two kinds of fact, kept in two tables because they are not the same thing and
// do not line up one-to-one:
//
//   income_receipts  what was invoiced. USD is the currency of record; soles are
//                    always derived as `amount_usd_cents x exchange_rate` and
//                    never stored, because the yearly gross is the sum of those
//                    unrounded products. Rounding each row to cents first drifts
//                    the gross a few cents off what SUNAT is told.
//
//   tax_retentions   what SUNAT's portal charged for a declaration month. This
//                    is an observed figure, logged as given — nothing derives it
//                    from the receipts. One row per month, which is why the
//                    unique constraint is on (team_id, month).
//
// The link between them is the month of `receipt_date`, so a month holding two
// receipts is covered by one retention without anything being tagged by hand.
// Neither table stores a year: it is read off the dates, the same way the
// expenses page does it, so a denormalised copy can't disagree with them.

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('income_receipts')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('team_id', 'uuid', (col) => col.notNull().references('teams.id').onDelete('cascade'))
    // When the money arrived vs. what the receipt is dated. Usually the same
    // day, occasionally days apart, and only the receipt date decides the
    // declaration month.
    .addColumn('income_date', 'text', (col) => col.notNull())
    .addColumn('receipt_date', 'text', (col) => col.notNull())
    .addColumn('description', 'text', (col) => col.notNull())
    .addColumn('company', 'text', (col) => col.notNull().defaultTo(''))
    .addColumn('receipt_number', 'text', (col) => col.notNull().defaultTo(''))
    .addColumn('amount_usd_cents', 'integer', (col) => col.notNull())
    // SUNAT's published rate for the receipt date. Four decimals in practice;
    // six leaves room without inviting a rounding argument.
    .addColumn('exchange_rate', sql`numeric(12, 6)`, (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('idx_income_receipts_team_id')
    .on('income_receipts')
    .column('team_id')
    .execute()

  await db.schema
    .createTable('tax_retentions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('team_id', 'uuid', (col) => col.notNull().references('teams.id').onDelete('cascade'))
    // The declaration month, "YYYY-MM". Text rather than a date because there
    // is no day here — SUNAT charges for a month, not a date.
    .addColumn('month', 'text', (col) => col.notNull())
    // What the portal said. Required: a retention with no amount is not a fact.
    .addColumn('amount_soles_cents', 'integer', (col) => col.notNull())
    // What it cost in dollars when paid. Optional, and deliberately not derived
    // from the soles: several months were settled together in one transfer, so
    // the dollar record doesn't always line up month for month.
    .addColumn('amount_usd_cents', 'integer')
    // Where "includes fees for prior years" lives. The amount above stays
    // whatever SUNAT charged; this explains it a year later.
    .addColumn('note', 'text', (col) => col.notNull().defaultTo(''))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('tax_retentions_team_month_unique', ['team_id', 'month'])
    .execute()

  await db.schema
    .createIndex('idx_tax_retentions_team_id')
    .on('tax_retentions')
    .column('team_id')
    .execute()

  // Two per-year knobs that belong to neither table above.
  await db.schema
    .createTable('tax_years')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('team_id', 'uuid', (col) => col.notNull().references('teams.id').onDelete('cascade'))
    .addColumn('year', 'integer', (col) => col.notNull())
    // The rate used to put the regularization in dollars. Hand-entered, because
    // it's whatever the rate was on the day it got paid.
    .addColumn('regularization_rate', sql`numeric(12, 6)`)
    // Stands in for a UIT SUNAT hasn't published. Next year's figure lands late
    // in December, so a January projection has nothing else to go on.
    .addColumn('uit_override', 'integer')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('tax_years_team_year_unique', ['team_id', 'year'])
    .execute()

  await db.schema.createIndex('idx_tax_years_team_id').on('tax_years').column('team_id').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('tax_years').ifExists().execute()
  await db.schema.dropTable('tax_retentions').ifExists().execute()
  await db.schema.dropTable('income_receipts').ifExists().execute()
}
