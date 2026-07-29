import { type Kysely } from 'kysely'

// Freezing existed to protect settled history from inline editing: every cell
// was one stray click away from being overwritten, so old readings were locked.
// Editing now happens in a dialog you have to open deliberately, which removes
// the hazard the lock was guarding against — and with it the ceremony of
// unfreezing a reading before correcting a typo in it.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('balance_snapshots').dropColumn('locked').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('balance_snapshots')
    .addColumn('locked', 'boolean', (col) => col.notNull().defaultTo(false))
    .execute()
}
