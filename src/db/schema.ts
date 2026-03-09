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

export interface CategoriesTable {
  id: Generated<string>
  name: string
  color: string | null
  sort_order: number
  created_at: Generated<Date>
}

export interface MovementsTable {
  id: Generated<string>
  description: string
  date: string
  amount_cents: number
  category_id: string | null
  sort_position: number
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export interface SnapshotsTable {
  id: Generated<string>
  name: string | null
  type: 'automatic' | 'manual'
  data: unknown
  pinned: Generated<boolean>
  created_at: Generated<Date>
}

export interface Database {
  users: UsersTable
  sessions: SessionsTable
  categories: CategoriesTable
  movements: MovementsTable
  snapshots: SnapshotsTable
}
