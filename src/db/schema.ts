import type { Generated } from 'kysely'

export interface TeamsTable {
  id: Generated<string>
  name: string
  is_default: Generated<boolean>
  created_at: Generated<Date>
}

export interface TeamMembershipsTable {
  id: Generated<string>
  team_id: string
  user_id: string
  created_at: Generated<Date>
}

export interface UsersTable {
  id: Generated<string>
  email: string
  /** From Google, refreshed on every login. */
  name: string | null
  /** Local override; null means fall back to `name`. */
  display_name: string | null
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

export interface ExpenseCategoriesTable {
  id: Generated<string>
  team_id: string
  name: string
  color: string
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export interface ExpenseItemsTable {
  id: Generated<string>
  team_id: string
  expense_category_id: string
  description: string
  date: string
  amount_soles_cents: number | null
  amount_usd_cents: number | null
  sort_position: number
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export interface ExpenseItemNotesTable {
  id: Generated<string>
  expense_item_id: string
  team_id: string
  content: string
  created_by_user_id: string | null
  updated_by_user_id: string | null
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export interface WealthSourcesTable {
  id: Generated<string>
  team_id: string
  name: string
  color: string
  sort_order: Generated<number>
  archived: Generated<boolean>
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export interface BalanceSnapshotsTable {
  id: Generated<string>
  team_id: string
  date: string
  /** Frozen: the reading is settled history and refuses edits or deletion. */
  locked: Generated<boolean>
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export interface BalanceEntriesTable {
  id: Generated<string>
  team_id: string
  balance_snapshot_id: string
  wealth_source_id: string
  amount_usd_cents: number
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export interface ColorBookmarksTable {
  id: Generated<string>
  team_id: string
  color: string
  sort_order: Generated<number>
  created_at: Generated<Date>
}

export interface UserPreferencesTable {
  id: Generated<string>
  user_id: string
  date_format: string
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export interface Database {
  teams: TeamsTable
  team_memberships: TeamMembershipsTable
  users: UsersTable
  sessions: SessionsTable
  expense_categories: ExpenseCategoriesTable
  expense_items: ExpenseItemsTable
  expense_item_notes: ExpenseItemNotesTable
  color_bookmarks: ColorBookmarksTable
  wealth_sources: WealthSourcesTable
  balance_snapshots: BalanceSnapshotsTable
  balance_entries: BalanceEntriesTable
  user_preferences: UserPreferencesTable
}
