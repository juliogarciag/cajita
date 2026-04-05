import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add period_type: 'monthly' (default) | 'annual'
  await db.schema
    .alterTable('recurring_movement_templates')
    .addColumn('period_type', 'text', (col) => col.notNull().defaultTo('monthly'))
    .execute()

  await sql`
    ALTER TABLE recurring_movement_templates
    ADD CONSTRAINT recurring_movement_templates_period_type_check
    CHECK (period_type IN ('monthly', 'annual'))
  `.execute(db)

  // Add month_of_year (1–12), required only for annual templates
  await db.schema
    .alterTable('recurring_movement_templates')
    .addColumn('month_of_year', 'integer')
    .execute()

  await sql`
    ALTER TABLE recurring_movement_templates
    ADD CONSTRAINT recurring_movement_templates_month_of_year_check
    CHECK (month_of_year BETWEEN 1 AND 12)
  `.execute(db)

  // Enforce discriminator: monthly → month_of_year IS NULL, annual → month_of_year IS NOT NULL
  await sql`
    ALTER TABLE recurring_movement_templates
    ADD CONSTRAINT recurring_movement_templates_period_month_check
    CHECK (
      (period_type = 'monthly' AND month_of_year IS NULL) OR
      (period_type = 'annual'  AND month_of_year IS NOT NULL)
    )
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE recurring_movement_templates
    DROP CONSTRAINT IF EXISTS recurring_movement_templates_period_month_check
  `.execute(db)

  await sql`
    ALTER TABLE recurring_movement_templates
    DROP CONSTRAINT IF EXISTS recurring_movement_templates_month_of_year_check
  `.execute(db)

  await db.schema
    .alterTable('recurring_movement_templates')
    .dropColumn('month_of_year')
    .execute()

  await sql`
    ALTER TABLE recurring_movement_templates
    DROP CONSTRAINT IF EXISTS recurring_movement_templates_period_type_check
  `.execute(db)

  await db.schema
    .alterTable('recurring_movement_templates')
    .dropColumn('period_type')
    .execute()
}
