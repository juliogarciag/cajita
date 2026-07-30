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
  /** Shown as a card on the dashboard. */
  pinned: Generated<boolean>
  /** Hand-arranged order of the pinned dashboard cards. */
  sort_order: Generated<number>
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
  /** 'cash' | 'investment' | 'property' | 'debt' — see migration 008. */
  kind: Generated<string>
  sort_order: Generated<number>
  archived: Generated<boolean>
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export interface BalanceSnapshotsTable {
  id: Generated<string>
  team_id: string
  date: string
  /** Human name for the reading, e.g. "March reading". See migration 009. */
  label: Generated<string>
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

export interface IncomeReceiptsTable {
  id: Generated<string>
  team_id: string
  income_date: string
  /** Its month is the SUNAT declaration month — see migration 012. */
  receipt_date: string
  description: string
  company: Generated<string>
  receipt_number: Generated<string>
  amount_usd_cents: number
  /** SUNAT's rate for the receipt date. Soles are derived, never stored. */
  exchange_rate: string | number
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export interface TaxRetentionsTable {
  id: Generated<string>
  team_id: string
  /** "YYYY-MM" — one row per declaration month. */
  month: string
  /** What SUNAT's portal charged. Logged as given, never derived. */
  amount_soles_cents: number
  /** What it cost in dollars, when recorded. Months are sometimes paid together. */
  amount_usd_cents: number | null
  note: Generated<string>
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export interface TaxYearsTable {
  id: Generated<string>
  team_id: string
  year: number
  regularization_rate: string | number | null
  /** Stands in for a UIT SUNAT hasn't published yet. */
  uit_override: number | null
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
  income_receipts: IncomeReceiptsTable
  tax_retentions: TaxRetentionsTable
  tax_years: TaxYearsTable
  color_bookmarks: ColorBookmarksTable
  wealth_sources: WealthSourcesTable
  balance_snapshots: BalanceSnapshotsTable
  balance_entries: BalanceEntriesTable
  user_preferences: UserPreferencesTable
}
