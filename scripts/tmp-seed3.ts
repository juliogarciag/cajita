import 'dotenv/config'
import { db } from '#/db/index.js'

// Julio's reported shape: monthly readings, then a pair two days apart.
const DATES = [
  '2025-08-30', '2025-09-28', '2025-10-30', '2025-11-29',
  '2025-12-30', '2026-01-28', '2026-02-27',
  '2026-07-30', '2026-08-01',
]
const AMOUNTS = [35_338, 33_100, 36_200, 39_800, 43_400, 45_600, 46_800, 60_400, 61_083]

const team = await db.selectFrom('teams').selectAll().orderBy('created_at', 'desc').limit(1).executeTakeFirstOrThrow()
console.log('seeding', team.name)
const source = await db.insertInto('wealth_sources')
  .values({ team_id: team.id, name: 'Bank', color: '#3b82f6', kind: 'cash' })
  .returningAll().executeTakeFirstOrThrow()

for (const [i, date] of DATES.entries()) {
  const snap = await db.insertInto('balance_snapshots').values({ team_id: team.id, date })
    .returningAll().executeTakeFirstOrThrow()
  await db.insertInto('balance_entries').values({
    team_id: team.id, balance_snapshot_id: snap.id,
    wealth_source_id: source.id, amount_usd_cents: AMOUNTS[i] * 100,
  }).execute()
}
await db.destroy()
