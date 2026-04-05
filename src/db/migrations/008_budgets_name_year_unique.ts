import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  // Remove duplicate budgets (keep the first one by id for each name+year pair)
  await sql`
    DELETE FROM budgets
    WHERE id NOT IN (
      SELECT MIN(id::text)::uuid FROM budgets GROUP BY name, year
    )
  `.execute(db)

  await db.schema
    .alterTable('budgets')
    .addUniqueConstraint('budgets_name_year_key', ['name', 'year'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('budgets').dropConstraint('budgets_name_year_key').execute()
}
