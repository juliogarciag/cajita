import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Create recurring_movement_templates table
  await db.schema
    .createTable('recurring_movement_templates')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('team_id', 'uuid', (col) =>
      col.notNull().references('teams.id').onDelete('cascade'),
    )
    .addColumn('description', 'text', (col) => col.notNull())
    .addColumn('amount_cents', 'integer', (col) => col.notNull())
    .addColumn('category_id', 'uuid', (col) => col.references('categories.id').onDelete('set null'))
    .addColumn('day_of_month', 'integer', (col) => col.notNull())
    .addColumn('start_date', 'date', (col) => col.notNull())
    .addColumn('end_date', 'date')
    .addColumn('active', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await sql`
    ALTER TABLE recurring_movement_templates
    ADD CONSTRAINT recurring_movement_templates_day_of_month_check
    CHECK (day_of_month BETWEEN 1 AND 31)
  `.execute(db)

  await db.schema
    .createIndex('idx_recurring_movement_templates_team_id')
    .on('recurring_movement_templates')
    .column('team_id')
    .execute()

  // 2. Extend movements table
  await db.schema
    .alterTable('movements')
    .addColumn('recurring_template_id', 'uuid', (col) =>
      col.references('recurring_movement_templates.id').onDelete('set null'),
    )
    .execute()

  await db.schema
    .alterTable('movements')
    .addColumn('recurring_period', 'date')
    .execute()

  await db.schema
    .alterTable('movements')
    .addColumn('confirmed', 'boolean', (col) => col.notNull().defaultTo(true))
    .execute()

  // Unique index for idempotent generation: one instance per template per month
  await sql`
    CREATE UNIQUE INDEX idx_movements_recurring_period
    ON movements (recurring_template_id, recurring_period)
    WHERE recurring_template_id IS NOT NULL
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_movements_recurring_period`.execute(db)

  await db.schema.alterTable('movements').dropColumn('confirmed').execute()
  await db.schema.alterTable('movements').dropColumn('recurring_period').execute()
  await db.schema.alterTable('movements').dropColumn('recurring_template_id').execute()

  await db.schema
    .dropIndex('idx_recurring_movement_templates_team_id')
    .ifExists()
    .execute()

  await db.schema.dropTable('recurring_movement_templates').ifExists().execute()
}
