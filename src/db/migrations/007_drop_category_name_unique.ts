import { type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('categories')
    .dropConstraint('categories_name_key')
    .execute()

  await db.schema
    .alterTable('budgets')
    .addUniqueConstraint('budgets_name_year_key', ['name', 'year'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('budgets')
    .dropConstraint('budgets_name_year_key')
    .execute()

  await db.schema
    .alterTable('categories')
    .addUniqueConstraint('categories_name_key', ['name'])
    .execute()
}
