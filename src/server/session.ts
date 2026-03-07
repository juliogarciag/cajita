import { db } from '#/db/index.js'

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)

  await db
    .insertInto('sessions')
    .values({ user_id: userId, token, expires_at: expiresAt })
    .execute()

  return token
}

export async function validateSession(token: string) {
  const row = await db
    .selectFrom('sessions')
    .innerJoin('users', 'users.id', 'sessions.user_id')
    .select(['users.id', 'users.email', 'users.name', 'users.picture', 'sessions.expires_at'])
    .where('sessions.token', '=', token)
    .executeTakeFirst()

  if (!row) return null

  if (new Date(row.expires_at) < new Date()) {
    await db.deleteFrom('sessions').where('token', '=', token).execute()
    return null
  }

  return { id: row.id, email: row.email, name: row.name, picture: row.picture }
}

export async function destroySession(token: string): Promise<void> {
  await db.deleteFrom('sessions').where('token', '=', token).execute()
}

export async function upsertUser(profile: {
  email: string
  name: string | null
  picture: string | null
}): Promise<string> {
  const existing = await db
    .selectFrom('users')
    .select('id')
    .where('email', '=', profile.email)
    .executeTakeFirst()

  if (existing) {
    await db
      .updateTable('users')
      .set({ name: profile.name, picture: profile.picture })
      .where('id', '=', existing.id)
      .execute()
    return existing.id
  }

  const result = await db
    .insertInto('users')
    .values({ email: profile.email, name: profile.name, picture: profile.picture })
    .returning('id')
    .executeTakeFirstOrThrow()

  return result.id
}
