import type { Kysely } from 'kysely'

// `users.name` is Google's, and it is overwritten from the profile on every
// login — anything written there by hand disappears at the next sign-in. The
// override lives in its own column so the two can coexist: Google keeps
// syncing `name`, and `display_name` wins wherever a name is shown. Null means
// "no override", which is how you get back to Google's.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('users').addColumn('display_name', 'text').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('users').dropColumn('display_name').execute()
}
