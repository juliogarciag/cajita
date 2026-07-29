import { sql, type Kysely } from 'kysely'

// `sessions.token` held the raw cookie value, which made the column itself a
// bearer credential: anything that could read it — a dump, the Railway console,
// an over-broad query — could be pasted into a cookie and be that user until
// the row expired. It now holds sha256(token) instead.
//
// The plaintext is right here, so the existing rows can be hashed in place and
// nobody gets logged out: validateSession hashes the presented cookie and finds
// the same row. sha256() is built into Postgres 11+, no pgcrypto needed.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`UPDATE sessions SET token = encode(sha256(token::bytea), 'hex')`.execute(db)
}

// A hash can't be turned back into the token it came from, so rolling back
// means invalidating every session rather than restoring the old values.
// Everyone signs in again; nothing else is lost.
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DELETE FROM sessions`.execute(db)
}
