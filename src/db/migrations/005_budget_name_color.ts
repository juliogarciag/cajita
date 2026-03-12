import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('budgets')
    .addColumn('name', 'text', (col) => col.notNull().defaultTo(''))
    .addColumn('color', 'text', (col) => col.notNull().defaultTo('#22c55e'))
    .execute()

  // Backfill name from category
  await sql`
    UPDATE budgets
    SET name = categories.name
    FROM categories
    WHERE budgets.category_id = categories.id
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('budgets').dropColumn('name').execute()
  await db.schema.alterTable('budgets').dropColumn('color').execute()
}
