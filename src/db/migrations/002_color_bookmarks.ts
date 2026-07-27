import type { Kysely } from 'kysely'
import { sql } from 'kysely'

// The category color picker used to offer a hardcoded palette. Colors are now
// data: an arbitrary color can be picked, and the ones worth keeping are
// bookmarked per team. Seeded with the old palette so nothing is lost.
const INITIAL_COLORS = [
  '#22c55e',
  '#3b82f6',
  '#a855f7',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#14b8a6',
  '#6366f1',
  '#f97316',
  '#6b7280',
]

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('color_bookmarks')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('team_id', 'uuid', (col) => col.notNull().references('teams.id').onDelete('cascade'))
    .addColumn('color', 'text', (col) => col.notNull())
    .addColumn('sort_order', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('color_bookmarks_team_color_unique', ['team_id', 'color'])
    .execute()

  await db.schema
    .createIndex('idx_color_bookmarks_team_id')
    .on('color_bookmarks')
    .column('team_id')
    .execute()

  // Seed every existing team with the previous palette
  for (const [index, color] of INITIAL_COLORS.entries()) {
    await sql`
      INSERT INTO color_bookmarks (team_id, color, sort_order)
      SELECT id, ${color}, ${index * 10} FROM teams
    `.execute(db)
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('color_bookmarks').ifExists().execute()
}
