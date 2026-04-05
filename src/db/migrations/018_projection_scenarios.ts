import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('projection_scenarios')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('team_id', 'uuid', (col) => col.notNull().references('teams.id').onDelete('cascade'))
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('script_id', 'text', (col) => col.notNull())
    .addColumn('inputs_json', 'jsonb', (col) => col.notNull())
    .addColumn('active', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await sql`
    CREATE UNIQUE INDEX projection_scenarios_team_name_unique
    ON projection_scenarios (team_id, name)
  `.execute(db)

  await db.schema
    .createIndex('idx_projection_scenarios_team_id')
    .on('projection_scenarios')
    .column('team_id')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('idx_projection_scenarios_team_id').ifExists().execute()
  await db.schema.dropTable('projection_scenarios').ifExists().execute()
}
