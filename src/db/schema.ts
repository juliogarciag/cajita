import type { Generated } from 'kysely'

export interface TeamsTable {
  id: Generated<string>
  name: string
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
  team_id: string
  name: string
  color: string
  budget_id: string | null
  sort_order: number
  archived: Generated<boolean>
  created_at: Generated<Date>
}

export interface MovementsTable {
  id: Generated<string>
  team_id: string
  description: string
  date: string
  amount_cents: number
  category_id: string | null
  sort_position: number
  source: Generated<string>
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export interface BudgetsTable {
  id: Generated<string>
  team_id: string
  category_id: string
  name: string
  year: number
  annual_amount_cents: number
  remaining_movement_id: string | null
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export interface BudgetItemsTable {
  id: Generated<string>
  budget_id: string
  description: string
  date: string
  amount_local_cents: number | null
  amount_cents: number
  accounting_date: string | null
  movement_id: string | null
  sort_position: number
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export interface SnapshotsTable {
  id: Generated<string>
  team_id: string
  name: string | null
  type: 'automatic' | 'manual'
  data: string
  pinned: Generated<boolean>
  created_at: Generated<Date>
}

export interface CheckpointsTable {
  id: Generated<string>
  team_id: string
  movement_id: string
  expected_cents: number
  actual_cents: number
  created_at: Generated<Date>
}

export interface UserPreferencesTable {
  id: Generated<string>
  user_id: string
  date_format: string
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export interface MovementNotesTable {
  id: Generated<string>
  movement_id: string
  team_id: string
  content: string
  created_by_user_id: string | null
  updated_by_user_id: string | null
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export interface BudgetItemNotesTable {
  id: Generated<string>
  budget_item_id: string
  team_id: string
  content: string
  created_by_user_id: string | null
  updated_by_user_id: string | null
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export interface Database {
  teams: TeamsTable
  team_memberships: TeamMembershipsTable
  users: UsersTable
  sessions: SessionsTable
  categories: CategoriesTable
  movements: MovementsTable
  snapshots: SnapshotsTable
  checkpoints: CheckpointsTable
  budgets: BudgetsTable
  budget_items: BudgetItemsTable
  user_preferences: UserPreferencesTable
  movement_notes: MovementNotesTable
  budget_item_notes: BudgetItemNotesTable
}
