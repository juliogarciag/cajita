import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add budget_id to categories (nullable FK to budgets)
  await db.schema
    .alterTable('categories')
    .addColumn('budget_id', 'uuid', (col) => col.references('budgets.id').onDelete('set null'))
    .execute()

  // Backfill: link existing budget categories
  await sql`UPDATE categories SET budget_id = budgets.id FROM budgets WHERE budgets.category_id = categories.id`.execute(
    db,
  )

  // Drop the unique constraint on (category_id, year) since each budget now creates its own category
  await db.schema.alterTable('budgets').dropConstraint('uq_budgets_category_year').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('budgets')
    .addUniqueConstraint('uq_budgets_category_year', ['category_id', 'year'])
    .execute()

  await db.schema.alterTable('categories').dropColumn('budget_id').execute()
}
