import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add team_id to movement_notes (denormalized for Electric scoping)
  await db.schema
    .alterTable('movement_notes')
    .addColumn('team_id', 'uuid', (col) => col.references('teams.id').onDelete('cascade'))
    .execute()

  // Backfill team_id from movements
  await sql`
    UPDATE movement_notes mn
    SET team_id = m.team_id
    FROM movements m
    WHERE m.id = mn.movement_id
  `.execute(db)

  // Make team_id NOT NULL now that it's backfilled
  await db.schema
    .alterTable('movement_notes')
    .alterColumn('team_id', (col) => col.setNotNull())
    .execute()

  // Add team_id to budget_item_notes
  await db.schema
    .alterTable('budget_item_notes')
    .addColumn('team_id', 'uuid', (col) => col.references('teams.id').onDelete('cascade'))
    .execute()

  // Backfill team_id from budget_items -> budgets
  await sql`
    UPDATE budget_item_notes bin
    SET team_id = b.team_id
    FROM budget_items bi
    JOIN budgets b ON b.id = bi.budget_id
    WHERE bi.id = bin.budget_item_id
  `.execute(db)

  await db.schema
    .alterTable('budget_item_notes')
    .alterColumn('team_id', (col) => col.setNotNull())
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('budget_item_notes').dropColumn('team_id').execute()
  await db.schema.alterTable('movement_notes').dropColumn('team_id').execute()
}
