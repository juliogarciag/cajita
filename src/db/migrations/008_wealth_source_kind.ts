import { sql, type Kysely } from 'kysely'

// What a source *is*, so the dashboard can report liquid assets and property
// equity separately instead of only their sum. The four kinds partition the
// sources exactly — liquid (cash + investment) and equity (property + debt)
// add up to net worth with nothing double-counted.
//
// Defaults to 'cash', which is what every existing source is.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('wealth_sources')
    .addColumn('kind', 'text', (col) => col.notNull().defaultTo('cash'))
    .execute()

  await db.schema
    .alterTable('wealth_sources')
    .addCheckConstraint(
      'wealth_sources_kind_check',
      sql`kind in ('cash', 'investment', 'property', 'debt')`,
    )
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('wealth_sources').dropColumn('kind').execute()
}
