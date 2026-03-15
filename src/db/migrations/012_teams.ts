import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Create teams table
  await db.schema
    .createTable('teams')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute()

  // 2. Create team_memberships join table
  await db.schema
    .createTable('team_memberships')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('team_id', 'uuid', (col) =>
      col.notNull().references('teams.id').onDelete('cascade'),
    )
    .addColumn('user_id', 'uuid', (col) =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint('team_memberships_team_user_unique', [
      'team_id',
      'user_id',
    ])
    .execute()

  // 3. Add nullable team_id to finance tables
  for (const table of [
    'categories',
    'movements',
    'budgets',
    'snapshots',
    'checkpoints',
  ]) {
    await db.schema
      .alterTable(table)
      .addColumn('team_id', 'uuid', (col) => col.references('teams.id'))
      .execute()
  }

  // 4. Create default team and backfill
  const result = await sql<{
    id: string
  }>`INSERT INTO teams (name) VALUES ('Default') RETURNING id`.execute(db)

  const teamId = result.rows[0].id

  // Assign all existing users to the default team
  await sql`
    INSERT INTO team_memberships (team_id, user_id)
    SELECT ${teamId}, id FROM users
  `.execute(db)

  // Backfill team_id on all finance tables
  for (const table of [
    'categories',
    'movements',
    'budgets',
    'snapshots',
    'checkpoints',
  ]) {
    await sql`UPDATE ${sql.table(table)} SET team_id = ${teamId}`.execute(db)
  }

  // 5. Make team_id NOT NULL
  for (const table of [
    'categories',
    'movements',
    'budgets',
    'snapshots',
    'checkpoints',
  ]) {
    await db.schema
      .alterTable(table)
      .alterColumn('team_id', (col) => col.setNotNull())
      .execute()
  }

  // 6. Add indexes for team_id queries
  for (const table of [
    'categories',
    'movements',
    'budgets',
    'snapshots',
    'checkpoints',
  ]) {
    await db.schema
      .createIndex(`idx_${table}_team_id`)
      .on(table)
      .column('team_id')
      .execute()
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of [
    'categories',
    'movements',
    'budgets',
    'snapshots',
    'checkpoints',
  ]) {
    await db.schema
      .dropIndex(`idx_${table}_team_id`)
      .ifExists()
      .execute()
    await db.schema.alterTable(table).dropColumn('team_id').execute()
  }

  await db.schema.dropTable('team_memberships').ifExists().execute()
  await db.schema.dropTable('teams').ifExists().execute()
}
