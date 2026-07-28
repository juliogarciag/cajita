/**
 * One-shot importer for the historical CSV ledger (2017–2026).
 *
 * Not a Kysely migration on purpose: `npm run start` runs migrations on every
 * production boot, and this must run by hand, once, against whichever database
 * DATABASE_URL points at. The CSVs stay outside the repo.
 *
 *   npm run import-ledger -- --dir ~/Desktop/migrate-data            # dry run
 *   npm run import-ledger -- --dir ~/Desktop/migrate-data --commit   # write
 *   npm run import-ledger -- --dir ... --commit --reset              # replace
 *
 * Dry run is the default and touches nothing.
 */
import 'dotenv/config'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { db } from '../src/db/index.js'

// --- Per-file quirks -------------------------------------------------------
// Every one of these was verified against the data, not assumed. The 2017–2022
// export predates the spreadsheet being rebuilt, so it disagrees with the rest
// on almost everything: no header, an extra reconciliation column, US-order
// dates. 2023 was kept in Spanish with European decimals.

type Layout = {
  file: string
  header: boolean
  dateOrder: 'MM/DD' | 'DD/MM'
  decimal: 'US' | 'EU'
  categoryIndex: number
}

const LAYOUTS: Layout[] = [
  { file: 'f2017-2022.csv', header: false, dateOrder: 'MM/DD', decimal: 'US', categoryIndex: 5 },
  { file: 'f2023.csv', header: true, dateOrder: 'DD/MM', decimal: 'EU', categoryIndex: 4 },
  { file: 'f2024.csv', header: true, dateOrder: 'DD/MM', decimal: 'US', categoryIndex: 4 },
  { file: 'f2025.csv', header: true, dateOrder: 'DD/MM', decimal: 'US', categoryIndex: 4 },
  { file: 'f2026.csv', header: true, dateOrder: 'DD/MM', decimal: 'US', categoryIndex: 4 },
]

// --- Category mapping ------------------------------------------------------
// The vocabulary was renamed twice (lowercase English → Spanish → English), so
// three source names often mean one thing. Edit this table; everything else is
// mechanical. A source name missing from here stops the run rather than being
// guessed at, so nothing lands in the wrong bucket silently.

// Only these four are tracked. Colors are placeholders — they get set properly
// in the app once the data is in.
const CATEGORIES: Record<string, { color: string; sources: string[] }> = {
  Goodies: { color: '#ec4899', sources: ['common goodie', 'Goodies'] },
  'Big Goodies': {
    color: '#a855f7',
    // "Discretionary Expenses" is what Big Goodies was called in 2025–2026.
    sources: ['rare goodie', 'Goodies Raros', 'Big Goodies', 'Discretionary Expenses'],
  },
  Health: { color: '#ef4444', sources: ['health', 'Salud', 'Health'] },
  Puppy: { color: '#f59e0b', sources: ['Puppy'] },
}

// Everything else in the ledger is dropped. Listing each name explicitly rather
// than defaulting to "skip" is the point: a source category nobody has ruled on
// stops the run instead of vanishing.
const EXCLUDED: Record<string, string> = {
  ...asExcluded('income', [
    'salary',
    'Sueldo',
    'Salary',
    'Freelo',
    'Ingresos Varios',
    'Entrada Libre',
    'Free Income',
    'reimbursement',
    'bank interest',
    'return',
    'goodie sale',
    'initial',
    'positive balance',
    'Positive balance',
  ]),
  ...asExcluded('envelope transfer', ['budget', 'Budget', 'Budget Mensual']),
  ...asExcluded('lending, not household spend', [
    'loan',
    'loan interest',
    'loan return',
    'rent return',
    'debt payment',
    'investment',
  ]),
  ...asExcluded('balancing entry', ['negative balance']),
  ...asExcluded('not tracked', [
    // Housing
    'rent',
    'rent upfront',
    'Hipoteca',
    'Mortgage',
    'down payment',
    'property',
    'move',
    // House improvements
    'improvements',
    'Mejoras',
    'House Improvements',
    // Everyday running costs
    'services',
    'Servicio',
    'Services',
    'education',
    'Educación',
    'Education',
    'taxes',
    'Impuestos',
    'Taxes',
    // Giving
    'giveaway',
    'gift',
    'Ayuda',
    'Help',
    // Catch-alls
    'travel',
    'leisure',
    'miscelaneous',
    'uncategorized',
    'Gasto Libre',
    'Free Expense',
    'Free Expenses',
    'Emergencies',
  ]),
}

function asExcluded(reason: string, names: string[]): Record<string, string> {
  return Object.fromEntries(names.map((n) => [n, reason]))
}

const SOURCE_TO_CANONICAL = new Map<string, string>()
for (const [canonical, { sources }] of Object.entries(CATEGORIES)) {
  for (const s of sources) SOURCE_TO_CANONICAL.set(s, canonical)
}

// --- Parsing ---------------------------------------------------------------

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (c !== '\r') field += c
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((f) => f.trim()))
}

/** "$ -500.00" | "-$600,00" | "$6.051,90" → integer cents, sign preserved. */
function parseAmountCents(raw: string, decimal: 'US' | 'EU'): number | null {
  const cleaned = raw.replace(/[\s $]/g, '')
  if (!cleaned || !/\d/.test(cleaned)) return null
  const negative = cleaned.includes('-')
  let digits = cleaned.replace(/[^\d.,]/g, '')
  // Strip thousands, normalise the decimal mark. Getting this backwards on the
  // 2023 file turns $6,051.90 into $6.05, so the two formats stay separate.
  digits = decimal === 'EU' ? digits.replace(/\./g, '').replace(',', '.') : digits.replace(/,/g, '')
  const value = Number(digits)
  if (!Number.isFinite(value)) return null
  const cents = Math.round(Math.abs(value) * 100)
  return negative ? -cents : cents
}

/** "02/03/2017" | "29 / 12 / 2022" → "YYYY-MM-DD", honouring the file's order. */
function parseDate(raw: string, order: 'MM/DD' | 'DD/MM'): string | null {
  const m = raw.replace(/\s/g, '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (!m) return null
  const [, a, b, y] = m
  const day = order === 'DD/MM' ? a : b
  const month = order === 'DD/MM' ? b : a
  const year = y.length === 2 ? `20${y}` : y
  const dd = day.padStart(2, '0')
  const mm = month.padStart(2, '0')
  if (+mm < 1 || +mm > 12 || +dd < 1 || +dd > 31) return null
  return `${year}-${mm}-${dd}`
}

const money = (units: number) => units.toLocaleString('en-US', { minimumFractionDigits: 2 })

/** The exports' running-total column is one account: the bank. */
const BANK_SOURCE = 'Bank account'

type Row = {
  description: string
  date: string
  /** Canonical currency. Null when the spend hasn't been exchanged yet. */
  usdCents: number | null
  /** Only set by supplements; the main ledger is USD-only. */
  solesCents: number | null
  category: string
  source: string
  origin: 'ledger' | 'supplement'
}

// --- Supplements -----------------------------------------------------------
// Hand-maintained top-ups for periods the spreadsheet exports don't cover,
// named `<year>-<category>-suplement.csv`. They differ from the exports in
// three ways that all matter: expenses are positive, there are two currency
// columns, and a row may carry soles with no USD — an unexchanged expense,
// which the app surfaces as pending rather than folding into the USD total.

const SUPPLEMENT_RE = /^\d{4}-(.+)-suplement\.csv$/i

const SLUG_TO_CATEGORY = new Map(
  Object.keys(CATEGORIES).map((name) => [name.toLowerCase().replace(/\s+/g, '-'), name]),
)

/** Pasting straight out of a spreadsheet gives tabs; a saved file gives commas. */
function splitDelimited(text: string): string[][] {
  const commas = (text.match(/,/g) ?? []).length
  const tabs = (text.match(/\t/g) ?? []).length
  if (tabs > commas) {
    return text
      .split('\n')
      .map((l) => l.replace(/\r$/, '').split('\t'))
      .filter((r) => r.some((f) => f.trim()))
  }
  return parseCSV(text)
}

/** "S/108.80" | "$3.29" | "-" | "" → cents, or null when absent. */
function parseMoney(raw: string): number | null {
  const cleaned = (raw ?? '').replace(/[\s$]/g, '').replace(/S\//gi, '')
  if (!cleaned || cleaned === '-' || !/\d/.test(cleaned)) return null
  const negative = cleaned.startsWith('-')
  const value = Number(cleaned.replace(/[^\d.]/g, ''))
  if (!Number.isFinite(value)) return null
  const cents = Math.round(value * 100)
  return negative ? -cents : cents
}

// --- Main ------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2)
  const flag = (name: string) => args.includes(`--${name}`)
  const value = (name: string) => {
    const i = args.indexOf(`--${name}`)
    return i >= 0 ? args[i + 1] : undefined
  }

  const dir = (value('dir') ?? '~/Desktop/migrate-data').replace(/^~/, os.homedir())
  const teamName = value('team')
  const commit = flag('commit')
  const reset = flag('reset')

  const rows: Row[] = []
  const skipped = new Map<string, number>()
  const unknown = new Map<string, number>()
  let malformed = 0
  // Every row's running bank balance, in file order — the source for readings.
  const balanceRows: { date: string; total: number }[] = []

  for (const layout of LAYOUTS) {
    const text = await fs.readFile(path.join(dir, layout.file), 'utf8')
    const parsed = parseCSV(text)
    const data = layout.header ? parsed.slice(1) : parsed

    for (const r of data) {
      const source = (r[layout.categoryIndex] ?? '').trim()
      const cents = parseAmountCents(r[2] ?? '', layout.decimal)
      const date = parseDate(r[1] ?? '', layout.dateOrder)
      const description = (r[0] ?? '').trim()

      // The running-total column is the bank balance after this row. It's read
      // before the expense filtering below, because a row that carries no
      // usable expense (an income row, a blank "$ -") still moves the balance.
      const total = parseAmountCents(r[3] ?? '', layout.decimal)
      if (date !== null && total !== null) balanceRows.push({ date, total })

      if (cents === null || date === null || !description) {
        malformed++
        continue
      }
      if (EXCLUDED[source]) {
        skipped.set(source, (skipped.get(source) ?? 0) + 1)
        continue
      }
      const canonical = SOURCE_TO_CANONICAL.get(source)
      if (!canonical) {
        unknown.set(source, (unknown.get(source) ?? 0) + 1)
        continue
      }
      // Positive rows inside an expense category are refunds/returns against
      // that category. Only outflows belong here.
      if (cents >= 0) {
        skipped.set(
          `${source} (positive amount)`,
          (skipped.get(`${source} (positive amount)`) ?? 0) + 1,
        )
        continue
      }
      rows.push({
        description,
        date,
        usdCents: Math.abs(cents),
        solesCents: null,
        category: canonical,
        source,
        origin: 'ledger',
      })
    }
  }

  // --- Supplements
  const supplementFiles = (await fs.readdir(dir)).filter((f) => SUPPLEMENT_RE.test(f)).sort()
  let pending = 0
  // Rows where USD and soles disagree on sign — a missing minus in the sheet.
  // Dropped as refunds either way, but surfaced so the source can be fixed.
  const signMismatches: string[] = []

  for (const file of supplementFiles) {
    const slug = file.match(SUPPLEMENT_RE)![1].toLowerCase()
    const canonical = SLUG_TO_CATEGORY.get(slug)
    if (!canonical) {
      throw new Error(
        `${file}: "${slug}" doesn't match a tracked category (${[...SLUG_TO_CATEGORY.keys()].join(', ')})`,
      )
    }

    const parsed = splitDelimited(await fs.readFile(path.join(dir, file), 'utf8'))
    // Header is optional — a pasted block has none. Detect by whether the
    // first cell parses as a date.
    const data = parseDate(parsed[0]?.[0] ?? '', 'DD/MM') ? parsed : parsed.slice(1)

    for (const r of data) {
      const date = parseDate(r[0] ?? '', 'DD/MM')
      const description = (r[1] ?? '').trim()
      const usd = parseMoney(r[2] ?? '')
      const soles = parseMoney(r[3] ?? '')

      if (date === null || !description || (usd === null && soles === null)) {
        malformed++
        continue
      }
      // Inverted against the exports: here an expense is positive, so a
      // negative row is a refund (Devolución) and drops out the same way.
      // Either column is enough to mark it — the sheet sometimes carries the
      // minus on only one of the two currencies.
      if ((usd !== null && usd < 0) || (soles !== null && soles < 0)) {
        if (usd !== null && soles !== null && usd > 0 !== soles > 0) {
          signMismatches.push(
            `  ${canonical}: "${description}" ${date} — USD ${(usd / 100).toFixed(2)}, soles ${(soles / 100).toFixed(2)}`,
          )
        }
        skipped.set(`${canonical} (refund)`, (skipped.get(`${canonical} (refund)`) ?? 0) + 1)
        continue
      }
      if (usd === null) pending++
      rows.push({
        description,
        date,
        usdCents: usd,
        solesCents: soles,
        category: canonical,
        source: file,
        origin: 'supplement',
      })
    }
  }

  // --- De-duplicate ledger rows superseded by a supplement
  // The supplement picks up where the export left off, so the boundary rows
  // appear in both — sometimes re-dated in the meantime, which is why the match
  // is on description + amount within a window rather than on the date.
  const WINDOW_DAYS = 45
  const dayOf = (d: string) => Date.parse(d) / 86_400_000
  const duplicates: string[] = []
  const supplementRows = rows.filter((r) => r.origin === 'supplement')

  const deduped = rows.filter((r) => {
    if (r.origin === 'supplement' || r.usdCents === null) return true
    const match = supplementRows.find(
      (s) =>
        s.category === r.category &&
        s.usdCents === r.usdCents &&
        s.description.toLowerCase() === r.description.toLowerCase() &&
        Math.abs(dayOf(s.date) - dayOf(r.date)) <= WINDOW_DAYS,
    )
    if (match) {
      duplicates.push(
        `  ${r.category}: "${r.description}" $${(r.usdCents / 100).toFixed(2)} — export ${r.date}, supplement ${match.date} (keeping supplement)`,
      )
      return false
    }
    return true
  })
  rows.length = 0
  rows.push(...deduped)

  // --- Report
  console.log(
    `\nParsed ${rows.length} expense rows from ${LAYOUTS.length} exports` +
      (supplementFiles.length ? ` and ${supplementFiles.length} supplement(s)` : '') +
      '\n',
  )

  if (duplicates.length) {
    console.log(`Dropped ${duplicates.length} export row(s) superseded by a supplement:`)
    duplicates.forEach((d) => console.log(d))
    console.log()
  }
  if (pending) {
    console.log(`${pending} row(s) have soles but no USD — imported as pending (unexchanged).\n`)
  }
  if (signMismatches.length) {
    console.log(`${signMismatches.length} row(s) disagree on sign between USD and soles, dropped:`)
    signMismatches.forEach((s) => console.log(s))
    console.log()
  }

  const byCategory = new Map<string, { n: number; cents: number; soles: number }>()
  for (const r of rows) {
    const e = byCategory.get(r.category) ?? { n: 0, cents: 0, soles: 0 }
    e.n++
    e.cents += r.usdCents ?? 0
    e.soles += r.solesCents ?? 0
    byCategory.set(r.category, e)
  }
  console.log('By category:')
  for (const [c, e] of [...byCategory.entries()].sort((a, b) => b[1].cents - a[1].cents)) {
    // Soles are recorded alongside USD on supplement rows; shown so a mangled
    // thousands separator is visible here rather than in the app.
    const soles = e.soles ? `   S/${money(e.soles / 100)} recorded` : ''
    console.log(
      `  ${c.padEnd(20)} ${String(e.n).padStart(5)} items   $${money(e.cents / 100)}${soles}`,
    )
  }

  const byYear = new Map<string, { n: number; cents: number }>()
  for (const r of rows) {
    const y = r.date.slice(0, 4)
    const e = byYear.get(y) ?? { n: 0, cents: 0 }
    e.n++
    e.cents += r.usdCents ?? 0
    byYear.set(y, e)
  }
  console.log('\nBy year:')
  for (const [y, e] of [...byYear.entries()].sort()) {
    console.log(
      `  ${y}  ${String(e.n).padStart(5)} items   $${(e.cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
    )
  }

  // --- Monthly bank readings
  // At most one per month, taking the month's last row *in file order*: the
  // running balance advances with the file, not with the date, and a handful of
  // rows sit a day or two out of date order.
  const byMonth = new Map<string, { date: string; total: number }>()
  for (const b of balanceRows) byMonth.set(b.date.slice(0, 7), b)
  const readings = [...byMonth.values()].sort((a, b) => a.date.localeCompare(b.date))

  if (readings.length) {
    const first = readings[0]
    const last = readings[readings.length - 1]
    console.log(
      `\nBank readings: ${readings.length} monthly, ${first.date} ($${money(first.total / 100)}) .. ${last.date} ($${money(last.total / 100)})`,
    )
  }

  if (skipped.size) {
    console.log('\nSkipped (by design):')
    for (const [s, n] of [...skipped.entries()].sort((a, b) => b[1] - a[1])) {
      const reason = EXCLUDED[s] ?? 'refund into an expense category'
      console.log(`  ${s.padEnd(28)} ${String(n).padStart(5)}   ${reason}`)
    }
  }
  if (malformed) console.log(`\nUnparseable rows: ${malformed}`)

  if (unknown.size) {
    console.log('\nUNMAPPED source categories — add them to CATEGORIES or EXCLUDED:')
    for (const [s, n] of [...unknown.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${s.padEnd(28)} ${String(n).padStart(5)} rows`)
    }
    console.log('\nRefusing to import while any category is unmapped.')
    await db.destroy()
    process.exit(1)
  }

  if (!commit) {
    console.log('\nDry run — nothing written. Re-run with --commit to import.')
    await db.destroy()
    return
  }

  // --- Write
  const team = teamName
    ? await db.selectFrom('teams').selectAll().where('name', '=', teamName).executeTakeFirst()
    : await db.selectFrom('teams').selectAll().where('is_default', '=', true).executeTakeFirst()
  if (!team) throw new Error(`No such team: ${teamName ?? '(default)'}`)

  const countIn = async (table: 'expense_items' | 'balance_snapshots') =>
    Number(
      (
        await db
          .selectFrom(table)
          .select(db.fn.count<number>('id').as('n'))
          .where('team_id', '=', team.id)
          .executeTakeFirst()
      )?.n ?? 0,
    )
  const [existingItems, existingReadings] = await Promise.all([
    countIn('expense_items'),
    countIn('balance_snapshots'),
  ])

  if ((existingItems > 0 || existingReadings > 0) && !reset) {
    throw new Error(
      `Team "${team.name}" already has ${existingItems} expense items and ${existingReadings} readings. ` +
        `Pass --reset to replace them, or --team to target another team.`,
    )
  }

  // Expenses and readings go in together: they come from one set of files and
  // describe one history, so a half-applied import isn't a useful state.
  await db.transaction().execute(async (tx) => {
    if (reset) {
      // Children first — notes hang off items, entries off snapshots/sources.
      await tx.deleteFrom('expense_item_notes').where('team_id', '=', team.id).execute()
      await tx.deleteFrom('expense_items').where('team_id', '=', team.id).execute()
      await tx.deleteFrom('expense_categories').where('team_id', '=', team.id).execute()
      await tx.deleteFrom('balance_entries').where('team_id', '=', team.id).execute()
      await tx.deleteFrom('balance_snapshots').where('team_id', '=', team.id).execute()
      await tx.deleteFrom('wealth_sources').where('team_id', '=', team.id).execute()
      console.log(`\nCleared existing expense and net worth data for team "${team.name}"`)
    }

    const ids = new Map<string, string>()
    for (const [name, { color }] of Object.entries(CATEGORIES)) {
      if (!byCategory.has(name)) continue // nothing landed here; don't create an empty category
      const row = await tx
        .insertInto('expense_categories')
        .values({ team_id: team.id, name, color })
        .returning('id')
        .executeTakeFirstOrThrow()
      ids.set(name, row.id)
    }

    // sort_position is the display order (the detail view sorts by it, not by
    // date), so assign it in date order per category, in 1000s — matching what
    // the app does on insert so later additions and reordering still work.
    const perCategory = new Map<string, Row[]>()
    for (const r of rows) {
      const list = perCategory.get(r.category) ?? []
      list.push(r)
      perCategory.set(r.category, list)
    }

    let inserted = 0
    for (const [category, list] of perCategory) {
      list.sort((a, b) => a.date.localeCompare(b.date))
      const values = list.map((r, i) => ({
        team_id: team.id,
        expense_category_id: ids.get(category)!,
        description: r.description,
        date: r.date,
        amount_soles_cents: r.solesCents,
        amount_usd_cents: r.usdCents,
        sort_position: (i + 1) * 1000,
      }))
      for (let i = 0; i < values.length; i += 500) {
        await tx
          .insertInto('expense_items')
          .values(values.slice(i, i + 500))
          .execute()
      }
      inserted += values.length
    }
    console.log(`Inserted ${ids.size} categories and ${inserted} expense items into "${team.name}"`)

    if (!readings.length) return

    // Readings are left unlocked — freezing is a deliberate act in the app, and
    // locking on import would make a bad import awkward to correct.
    const bank = await tx
      .insertInto('wealth_sources')
      .values({ team_id: team.id, name: BANK_SOURCE, color: '#3b82f6', sort_order: 0 })
      .returning('id')
      .executeTakeFirstOrThrow()

    const snapshots = await tx
      .insertInto('balance_snapshots')
      .values(readings.map((r) => ({ team_id: team.id, date: r.date })))
      .returning(['id', 'date'])
      .execute()

    const snapshotByDate = new Map(snapshots.map((s) => [s.date, s.id]))
    await tx
      .insertInto('balance_entries')
      .values(
        readings.map((r) => ({
          team_id: team.id,
          balance_snapshot_id: snapshotByDate.get(r.date)!,
          wealth_source_id: bank.id,
          amount_usd_cents: r.total,
        })),
      )
      .execute()

    console.log(`Inserted "${BANK_SOURCE}" with ${readings.length} monthly readings`)
  })

  await db.destroy()
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err)
  await db.destroy().catch(() => {})
  process.exit(1)
})
