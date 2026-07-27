import type { Kysely } from 'kysely'
import { sql } from 'kysely'

// Net worth tracking. Deliberately independent of expenses: a reading is
// something observed, never derived from movements.
//
// A "snapshot" is one dated sweep across every source, entered in a single
// sitting. Capturing all sources together is what makes each total a real
// number rather than a carry-forward reconstruction.

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('wealth_sources')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('team_id', 'uuid', (col) => col.notNull().references('teams.id').onDelete('cascade'))
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('color', 'text', (col) => col.notNull())
    .addColumn('sort_order', 'integer', (col) => col.notNull().defaultTo(0))
    // Archived sources drop out of new readings but keep their history
    .addColumn('archived', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('wealth_sources_team_name_unique', ['team_id', 'name'])
    .execute()

  await db.schema
    .createIndex('idx_wealth_sources_team_id')
    .on('wealth_sources')
    .column('team_id')
    .execute()

  await db.schema
    .createTable('balance_snapshots')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('team_id', 'uuid', (col) => col.notNull().references('teams.id').onDelete('cascade'))
    .addColumn('date', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('idx_balance_snapshots_team_id')
    .on('balance_snapshots')
    .column('team_id')
    .execute()

  // One amount per source per snapshot. A missing row means "not filled in" —
  // zero is a real value and gets a row of its own.
  await db.schema
    .createTable('balance_entries')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('team_id', 'uuid', (col) => col.notNull().references('teams.id').onDelete('cascade'))
    .addColumn('balance_snapshot_id', 'uuid', (col) =>
      col.notNull().references('balance_snapshots.id').onDelete('cascade'),
    )
    .addColumn('wealth_source_id', 'uuid', (col) =>
      col.notNull().references('wealth_sources.id').onDelete('cascade'),
    )
    .addColumn('amount_usd_cents', 'integer', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('balance_entries_snapshot_source_unique', [
      'balance_snapshot_id',
      'wealth_source_id',
    ])
    .execute()

  await db.schema
    .createIndex('idx_balance_entries_team_id')
    .on('balance_entries')
    .column('team_id')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('balance_entries').ifExists().execute()
  await db.schema.dropTable('balance_snapshots').ifExists().execute()
  await db.schema.dropTable('wealth_sources').ifExists().execute()
}
