import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('teams')
    .addColumn('is_default', 'boolean', (col) => col.notNull().defaultTo(false))
    .execute()

  // Mark the oldest team (the original Default team) as the default
  await sql`
    UPDATE teams
    SET is_default = true
    WHERE id = (SELECT id FROM teams ORDER BY created_at ASC LIMIT 1)
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('teams').dropColumn('is_default').execute()
}
