import type { Generated } from 'kysely'

export interface UsersTable {
  id: Generated<string>
  email: string
  name: string | null
  picture: string | null
  created_at: Generated<Date>
}

export interface SessionsTable {
  id: Generated<string>
  user_id: string
  token: string
  expires_at: Date
  created_at: Generated<Date>
}

export interface Database {
  users: UsersTable
  sessions: SessionsTable
}
