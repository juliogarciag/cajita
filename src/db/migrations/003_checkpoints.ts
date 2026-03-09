import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('checkpoints')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('movement_id', 'uuid', (col) =>
      col.notNull().references('movements.id').onDelete('restrict'),
    )
    .addColumn('expected_cents', 'integer', (col) => col.notNull())
    .addColumn('actual_cents', 'integer', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('idx_checkpoints_created')
    .on('checkpoints')
    .column('created_at')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('checkpoints').execute()
}
