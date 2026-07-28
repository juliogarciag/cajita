import type { Kysely } from 'kysely'

// Pinned dashboard cards are arranged by hand, so they need somewhere to
// remember that. Defaults to 0 for every existing row, which leaves the
// previous alphabetical order intact until something is actually dragged.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('expense_categories')
    .addColumn('sort_order', 'integer', (col) => col.notNull().defaultTo(0))
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('expense_categories').dropColumn('sort_order').execute()
}
