/**
 * One-shot importer for the house and its mortgage.
 *
 * Reads the lender's payment schedules (PDF) and writes a House and a Mortgage
 * balance into every existing reading from the purchase onward. Like
 * import-ledger this is a script rather than a Kysely migration: migrations run
 * on every production boot, and these PDFs live outside the repo.
 *
 *   npm run import-mortgage -- --dir ~/Downloads              # dry run
 *   npm run import-mortgage -- --dir ~/Downloads --commit
 *
 * Run it *after* import-ledger — it fills readings that already exist and never
 * creates one. Note that `import-ledger --reset` clears wealth sources and
 * readings, so re-running that means re-running this too.
 */
import 'dotenv/config'
import { promises as fs } from 'node:fs'
import { inflateSync } from 'node:zlib'
import * as path from 'node:path'
import * as os from 'node:os'
import { db } from '../src/db/index.js'

// --- The purchase ----------------------------------------------------------

/** What the house is carried at. Not the same as price paid: $90,000 down plus
 *  $313,207.40 borrowed is $403,207.40, and the $1,707.40 difference was fees —
 *  money spent, not an asset. */
const HOUSE_USD_CENTS = 40_150_000

/**
 * The reading at which the house first appears. Four days before the loan was
 * disbursed (30/11/2022), because the down payment had already left the bank by
 * then: recording the purchase at the December reading instead would leave a
 * one-month hole showing the cash gone and no house yet.
 */
const PURCHASE_READING = '2022-11-26'

/** December 2025: the loan was refinanced. Balances splice to the cent, so this
 *  is only about which schedule to read, not a discontinuity. */
const REFINANCED_ON = '2025-11-30'

const HOUSE_SOURCE = 'House'
const MORTGAGE_SOURCE = 'Mortgage'

const SCHEDULES = [
  { file: 'Cronograma-old.pdf', until: REFINANCED_ON },
  { file: 'Cronograma.pdf', until: null },
]

// --- PDF parsing -----------------------------------------------------------

type Installment = { n: number; due: string; saldo: number }

/** Text runs out of a PDF's Flate-compressed content streams. */
function textRuns(pdf: Buffer): string[] {
  const runs: string[] = []
  const marker = Buffer.from('stream')
  let at = pdf.indexOf(marker)

  while (at >= 0) {
    // "endstream" contains "stream", so an opening marker is one that isn't
    // preceded by "end" and is followed by a newline.
    const precededByEnd = at >= 3 && pdf.subarray(at - 3, at).toString('latin1') === 'end'
    const nextByte = pdf[at + marker.length]
    if (precededByEnd || (nextByte !== 0x0d && nextByte !== 0x0a)) {
      at = pdf.indexOf(marker, at + marker.length)
      continue
    }

    let start = at + marker.length
    if (pdf[start] === 0x0d) start++
    if (pdf[start] === 0x0a) start++
    const end = pdf.indexOf(Buffer.from('endstream'), start)
    if (end < 0) break

    try {
      const text = inflateSync(pdf.subarray(start, end)).toString('latin1')
      if (text.includes('Tj') || text.includes('TJ')) {
        for (const m of text.matchAll(/\((?:[^()\\]|\\.)*\)/g)) {
          runs.push(m[0].slice(1, -1))
        }
      }
    } catch {
      // Not a Flate stream (fonts, images) — nothing to read here.
    }
    at = pdf.indexOf(marker, end)
  }
  return runs
}

const MONEY = /^-?[\d,]+\.\d{2}$/
const DDMMYYYY = /^(\d{2})\/(\d{2})\/(\d{4})$/

/**
 * The installment rows: "Cuota | n | due date | Saldo Capital | Amortización | …".
 *
 * `Saldo Capital` is the principal outstanding *entering* that installment, so
 * the balance on a given date is the saldo of the next instalment not yet due.
 */
function parseSchedule(runs: string[]): Installment[] {
  const rows: Installment[] = []

  for (let i = 0; i < runs.length; i++) {
    if (runs[i] !== 'Cuota') continue
    const n = Number(runs[i + 1])
    const date = DDMMYYYY.exec(runs[i + 2] ?? '')
    if (!Number.isInteger(n) || !date) continue

    const numbers: number[] = []
    let j = i + 3
    while (j < runs.length && MONEY.test(runs[j])) {
      numbers.push(Number(runs[j].replace(/,/g, '')))
      j++
    }
    if (numbers.length >= 2) {
      const [, dd, mm, yyyy] = date
      rows.push({ n, due: `${yyyy}-${mm}-${dd}`, saldo: numbers[0] })
    }
    i = j - 1
  }

  // Each installment appears once per page render; keep the first sighting.
  const seen = new Set<number>()
  return rows
    .filter((r) => (seen.has(r.n) ? false : (seen.add(r.n), true)))
    .sort((a, b) => a.n - b.n)
}

async function loadSchedules(dir: string) {
  const loaded = []
  for (const { file, until } of SCHEDULES) {
    const runs = textRuns(await fs.readFile(path.join(dir, file)))
    const rows = parseSchedule(runs)
    if (rows.length === 0) throw new Error(`${file}: no installments found`)
    loaded.push({ file, until, rows })
  }
  return loaded
}

type Schedules = Awaited<ReturnType<typeof loadSchedules>>

/** Principal outstanding on a date, or null before the house was bought. */
function balanceOn(date: string, schedules: Schedules): number | null {
  if (date < PURCHASE_READING) return null
  const active = schedules.find((s) => s.until === null || date < s.until) ?? schedules[0]
  const next = active.rows.find((r) => r.due > date)
  // Past the final instalment the loan is repaid.
  return next ? next.saldo : 0
}

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`

// --- Main ------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2)
  const flag = (n: string) => args.includes(`--${n}`)
  const value = (n: string) => {
    const i = args.indexOf(`--${n}`)
    return i >= 0 ? args[i + 1] : undefined
  }

  const dir = (value('dir') ?? '~/Downloads').replace(/^~/, os.homedir())
  const teamName = value('team')
  const commit = flag('commit')
  const reset = flag('reset')

  const schedules = await loadSchedules(dir)
  for (const s of schedules) {
    const repaid = s.rows.reduce(
      (sum, r, i) => sum + (s.rows[i + 1] ? r.saldo - s.rows[i + 1].saldo : r.saldo),
      0,
    )
    console.log(
      `${s.file}: ${s.rows.length} installments, ${s.rows[0].due} .. ${s.rows[s.rows.length - 1].due}, principal ${money(Math.round(repaid * 100))}`,
    )
  }

  const team = teamName
    ? await db.selectFrom('teams').selectAll().where('name', '=', teamName).executeTakeFirst()
    : await db.selectFrom('teams').selectAll().where('is_default', '=', true).executeTakeFirst()
  if (!team) throw new Error(`No such team: ${teamName ?? '(default)'}`)

  const snapshots = await db
    .selectFrom('balance_snapshots')
    .select(['id', 'date'])
    .where('team_id', '=', team.id)
    .orderBy('date', 'asc')
    .execute()

  const targets = snapshots
    .map((s) => ({ ...s, mortgage: balanceOn(s.date, schedules) }))
    .filter((s): s is typeof s & { mortgage: number } => s.mortgage !== null)

  console.log(
    `\n${targets.length} of ${snapshots.length} readings are on or after ${PURCHASE_READING}\n`,
  )
  const preview = [...targets.slice(0, 3), null, ...targets.slice(-3)]
  console.log(
    `${'reading'.padEnd(13)}${'house'.padStart(14)}${'mortgage'.padStart(16)}${'equity'.padStart(15)}`,
  )
  for (const t of preview) {
    if (!t) {
      console.log('   …')
      continue
    }
    const m = Math.round(t.mortgage * 100)
    console.log(
      `${t.date.padEnd(13)}${money(HOUSE_USD_CENTS).padStart(14)}${('-' + money(m)).padStart(16)}${money(HOUSE_USD_CENTS - m).padStart(15)}`,
    )
  }

  if (!commit) {
    console.log('\nDry run — nothing written. Re-run with --commit to import.')
    await db.destroy()
    return
  }

  await db.transaction().execute(async (tx) => {
    // Reuse sources that already exist rather than colliding on (team, name) —
    // the same lesson as the category importer.
    const ensureSource = async (name: string, color: string, kind: string, order: number) => {
      const existing = await tx
        .selectFrom('wealth_sources')
        .select('id')
        .where('team_id', '=', team.id)
        .where('name', '=', name)
        .executeTakeFirst()
      if (existing) return existing.id
      const row = await tx
        .insertInto('wealth_sources')
        .values({ team_id: team.id, name, color, kind, sort_order: order })
        .returning('id')
        .executeTakeFirstOrThrow()
      return row.id
    }

    const houseId = await ensureSource(HOUSE_SOURCE, '#8b5cf6', 'property', 100)
    const mortgageId = await ensureSource(MORTGAGE_SOURCE, '#ef4444', 'debt', 110)

    const already = await tx
      .selectFrom('balance_entries')
      .select(tx.fn.count<number>('id').as('n'))
      .where('team_id', '=', team.id)
      .where((eb) =>
        eb.or([eb('wealth_source_id', '=', houseId), eb('wealth_source_id', '=', mortgageId)]),
      )
      .executeTakeFirst()

    if (Number(already?.n ?? 0) > 0) {
      if (!reset) {
        throw new Error(
          `House/Mortgage already have ${already?.n} entries. Pass --reset to replace them.`,
        )
      }
      await tx
        .deleteFrom('balance_entries')
        .where('team_id', '=', team.id)
        .where((eb) =>
          eb.or([eb('wealth_source_id', '=', houseId), eb('wealth_source_id', '=', mortgageId)]),
        )
        .execute()
      console.log('\nCleared existing House/Mortgage entries')
    }

    const values = targets.flatMap((t) => [
      {
        team_id: team.id,
        balance_snapshot_id: t.id,
        wealth_source_id: houseId,
        amount_usd_cents: HOUSE_USD_CENTS,
      },
      {
        team_id: team.id,
        balance_snapshot_id: t.id,
        wealth_source_id: mortgageId,
        // A liability is a negative balance; net-worth.ts just sums.
        amount_usd_cents: -Math.round(t.mortgage * 100),
      },
    ])

    for (let i = 0; i < values.length; i += 500) {
      await tx
        .insertInto('balance_entries')
        .values(values.slice(i, i + 500))
        .execute()
    }
    console.log(
      `Wrote ${values.length} entries across ${targets.length} readings in "${team.name}"`,
    )
  })

  await db.destroy()
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err)
  await db.destroy().catch(() => {})
  process.exit(1)
})
