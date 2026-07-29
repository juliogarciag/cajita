import { createHash } from 'node:crypto'
import { db } from '#/db/index.js'
import { DEFAULT_PALETTE } from '#/lib/category-colors.js'

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

/**
 * What's stored is the hash, never the token itself — the raw value is a bearer
 * credential, so a column holding it *is* the credential and anything that can
 * read the database (a dump, the Railway console, an over-broad query) can log
 * in as that user. No salt or slow KDF: the token is 122 bits of CSPRNG output,
 * so it isn't guessable and bcrypt's reason for existing — grinding low-entropy
 * passwords — doesn't apply.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)

  // Logging in is the one moment we know something is happening, and expired
  // rows are otherwise only cleared when their own token is presented again —
  // which, for a session someone simply abandoned, never happens.
  await db.deleteFrom('sessions').where('expires_at', '<', new Date()).execute()

  await db
    .insertInto('sessions')
    .values({ user_id: userId, token: hashToken(token), expires_at: expiresAt })
    .execute()

  return token
}

export async function validateSession(token: string) {
  const row = await db
    .selectFrom('sessions')
    .innerJoin('users', 'users.id', 'sessions.user_id')
    .select([
      'users.id',
      'users.email',
      'users.name',
      'users.display_name',
      'users.picture',
      'sessions.expires_at',
    ])
    .where('sessions.token', '=', hashToken(token))
    .executeTakeFirst()

  if (!row) return null

  if (new Date(row.expires_at) < new Date()) {
    await db.deleteFrom('sessions').where('token', '=', hashToken(token)).execute()
    return null
  }

  // Resolve the user's team (pick the first one)
  const membership = await db
    .selectFrom('team_memberships')
    .select('team_id')
    .where('user_id', '=', row.id)
    .orderBy('created_at', 'asc')
    .executeTakeFirst()

  if (!membership) return null

  return {
    id: row.id,
    email: row.email,
    // Everything downstream reads `name` and gets the override for free.
    name: row.display_name ?? row.name,
    /** Google's, kept separate so Settings can show what's being overridden. */
    googleName: row.name,
    displayName: row.display_name,
    picture: row.picture,
    teamId: membership.team_id,
  }
}

export async function destroySession(token: string): Promise<void> {
  await db.deleteFrom('sessions').where('token', '=', hashToken(token)).execute()
}

export async function ensureTeamMembership(userId: string): Promise<void> {
  const existing = await db
    .selectFrom('team_memberships')
    .select('id')
    .where('user_id', '=', userId)
    .executeTakeFirst()

  if (existing) return

  // Assign to the default team
  const team = await db
    .selectFrom('teams')
    .select('id')
    .where('is_default', '=', true)
    .executeTakeFirstOrThrow()

  await db.insertInto('team_memberships').values({ team_id: team.id, user_id: userId }).execute()
}

export async function createIsolatedTeam(userId: string, teamName: string): Promise<string> {
  const team = await db
    .insertInto('teams')
    .values({ name: teamName })
    .returning('id')
    .executeTakeFirstOrThrow()

  await db.insertInto('team_memberships').values({ team_id: team.id, user_id: userId }).execute()

  await db
    .insertInto('color_bookmarks')
    .values(
      DEFAULT_PALETTE.map((color, index) => ({
        team_id: team.id,
        color,
        sort_order: index * 10,
      })),
    )
    .execute()

  return team.id
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
