import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  // Backfill any null category colors with gray
  await sql`UPDATE categories SET color = '#6b7280' WHERE color IS NULL`.execute(db)

  // Make category color non-nullable
  await db.schema
    .alterTable('categories')
    .alterColumn('color', (col) => col.setNotNull())
    .execute()

  // Drop redundant color column from budgets (derived from category)
  await db.schema.alterTable('budgets').dropColumn('color').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Re-add color column to budgets
  await db.schema
    .alterTable('budgets')
    .addColumn('color', 'text', (col) => col.notNull().defaultTo('#22c55e'))
    .execute()

  // Backfill budget colors from their categories
  await sql`
    UPDATE budgets
    SET color = categories.color
    FROM categories
    WHERE budgets.category_id = categories.id
  `.execute(db)

  // Make category color nullable again
  await db.schema
    .alterTable('categories')
    .alterColumn('color', (col) => col.dropNotNull())
    .execute()
}
