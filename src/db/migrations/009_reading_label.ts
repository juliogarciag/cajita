import { sql, type Kysely } from 'kysely'

// Readings are identified by date alone, which stops working once there are
// years of them: "26/03/2026" says when but not what, and two sweeps in the
// same month are indistinguishable. A label gives each one a name.
//
// Backfilled as "{Month} reading", numbered within a month where several
// already exist, which is the same default new readings get.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('balance_snapshots')
    .addColumn('label', 'text', (col) => col.notNull().defaultTo(''))
    .execute()

  await sql`
    UPDATE balance_snapshots s
    SET label = trim(to_char(s.date::date, 'Month')) || ' reading' ||
      CASE WHEN n.seq > 1 THEN ' ' || n.seq ELSE '' END
    FROM (
      SELECT id, row_number() OVER (
        PARTITION BY team_id, to_char(date::date, 'YYYY-MM') ORDER BY date, created_at
      ) seq
      FROM balance_snapshots
    ) n
    WHERE n.id = s.id
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('balance_snapshots').dropColumn('label').execute()
}
