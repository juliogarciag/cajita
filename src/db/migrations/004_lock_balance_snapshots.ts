import type { Kysely } from 'kysely'

// Past readings settle: once a sweep is done and checked, its numbers are
// history. Locking makes that explicit so a stray click can't edit or delete
// a reading — the same reasoning as the expense-category delete guard.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('balance_snapshots')
    .addColumn('locked', 'boolean', (col) => col.notNull().defaultTo(false))
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('balance_snapshots').dropColumn('locked').execute()
}
