import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add source column to movements
  await db.schema
    .alterTable('movements')
    .addColumn('source', 'text', (col) => col.notNull().defaultTo('manual'))
    .execute()

  // Create budgets table
  await db.schema
    .createTable('budgets')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('category_id', 'uuid', (col) =>
      col.notNull().references('categories.id').onDelete('restrict'),
    )
    .addColumn('year', 'integer', (col) => col.notNull())
    .addColumn('annual_amount_cents', 'integer', (col) => col.notNull())
    .addColumn('remaining_movement_id', 'uuid', (col) =>
      col.references('movements.id').onDelete('set null'),
    )
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('uq_budgets_category_year', ['category_id', 'year'])
    .execute()

  // Create budget_items table
  await db.schema
    .createTable('budget_items')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('budget_id', 'uuid', (col) =>
      col.notNull().references('budgets.id').onDelete('cascade'),
    )
    .addColumn('description', 'text', (col) => col.notNull().defaultTo(''))
    .addColumn('date', 'text', (col) => col.notNull())
    .addColumn('amount_local_cents', 'integer')
    .addColumn('amount_cents', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('accounting_date', 'text')
    .addColumn('movement_id', 'uuid', (col) => col.references('movements.id').onDelete('set null'))
    .addColumn('sort_position', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  // Indexes
  await db.schema
    .createIndex('idx_budget_items_budget')
    .on('budget_items')
    .column('budget_id')
    .execute()

  await db.schema
    .createIndex('idx_budget_items_movement')
    .on('budget_items')
    .column('movement_id')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('budget_items').execute()
  await db.schema.dropTable('budgets').execute()
  await db.schema.alterTable('movements').dropColumn('source').execute()
}
