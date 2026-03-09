import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('categories')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('name', 'text', (col) => col.notNull().unique())
    .addColumn('color', 'text')
    .addColumn('sort_order', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createTable('movements')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('description', 'text', (col) => col.notNull())
    .addColumn('date', 'date', (col) => col.notNull())
    .addColumn('amount_cents', 'integer', (col) => col.notNull())
    .addColumn('category_id', 'uuid', (col) => col.references('categories.id').onDelete('set null'))
    .addColumn('sort_position', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('idx_movements_date')
    .on('movements')
    .columns(['date', 'sort_position'])
    .execute()

  await db.schema
    .createIndex('idx_movements_category')
    .on('movements')
    .column('category_id')
    .execute()

  await db.schema
    .createTable('snapshots')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('name', 'text')
    .addColumn('type', 'text', (col) => col.notNull().defaultTo('automatic'))
    .addColumn('data', 'jsonb', (col) => col.notNull())
    .addColumn('pinned', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('idx_snapshots_type_created')
    .on('snapshots')
    .columns(['type', 'created_at'])
    .execute()

  // Add check constraint for snapshot type
  await sql`ALTER TABLE snapshots ADD CONSTRAINT chk_snapshot_type CHECK (type IN ('automatic', 'manual'))`.execute(db)

  // Seed initial categories
  await db
    .insertInto('categories' as never)
    .values([
      { name: 'Free Income', color: '#16a34a', sort_order: 1 },
      { name: 'Salary', color: '#15803d', sort_order: 2 },
      { name: 'Budget', color: '#3b82f6', sort_order: 3 },
      { name: 'Help', color: '#6b7280', sort_order: 4 },
      { name: 'Taxes', color: '#991b1b', sort_order: 5 },
      { name: 'Discretionary Expenses', color: '#64748b', sort_order: 6 },
      { name: 'Goodies', color: '#059669', sort_order: 7 },
    ] as never)
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('snapshots').execute()
  await db.schema.dropTable('movements').execute()
  await db.schema.dropTable('categories').execute()
}
