import type { Kysely } from 'kysely'

// A pinned category gets a card on the dashboard. A flag on the category rather
// than a separate table: it's one boolean per category, already team-scoped,
// and it rides the existing Electric shape so the dashboard updates the moment
// it's toggled from either page.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('expense_categories')
    .addColumn('pinned', 'boolean', (col) => col.notNull().defaultTo(false))
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('expense_categories').dropColumn('pinned').execute()
}
