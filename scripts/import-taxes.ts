/**
 * One-shot importer for the "Taxes Calculations" spreadsheet (2022–2026).
 *
 * Not a Kysely migration on purpose: `npm run start` runs migrations on every
 * production boot, and this must run by hand, once, against whichever database
 * DATABASE_URL points at. The spreadsheet stays outside the repo.
 *
 *   npm run import-taxes                                          # dry run
 *   npm run import-taxes -- --file ~/Downloads/Taxes\ Calculations.xlsx
 *   npm run import-taxes -- --commit                              # write
 *   npm run import-taxes -- --commit --reset                      # replace
 *
 * Dry run is the default and touches nothing.
 *
 * The .xlsx is read directly rather than via a CSV export, because two things
 * only exist in the workbook itself and both matter:
 *
 *   - Merged cells. A retention covering two receipts is stored as one merged
 *     cell spanning their rows, so the coverage is a fact in the file rather
 *     than something inferred from blank neighbours.
 *   - Cached formula results. Every year's own totals are in there, which is
 *     what makes this import self-checking: the parsed figures are compared
 *     against the sheet's and a mismatch stops the run.
 *
 * That check is the reason a hand-rolled reader is acceptable here. If the
 * parsing is wrong, the totals disagree and nothing is written.
 */
import 'dotenv/config'
import { execFileSync } from 'node:child_process'
import * as os from 'node:os'
import { db } from '../src/db/index.js'
import { incomeTax, uitForYear } from '../src/lib/income-tax.js'

// --- Minimal .xlsx reading -------------------------------------------------

/** Reads one entry out of the zip. `unzip` ships with macOS and most Linux. */
function readEntry(file: string, entry: string): string {
  return execFileSync('unzip', ['-p', file, entry], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
}

function listEntries(file: string): string[] {
  return execFileSync('unzip', ['-Z1', file], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
}

/**
 * The shared string table. Rich text splits one string across several <t>
 * elements, so everything inside an <si> is concatenated.
 */
function parseSharedStrings(xml: string): string[] {
  const out: string[] = []
  for (const [, body] of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let text = ''
    for (const [, part] of body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) text += part
    out.push(decodeEntities(text))
  }
  return out
}

type Cell = { raw: string; text: string | null; number: number | null }
type Sheet = { cells: Map<string, Cell>; merges: Array<{ from: string; to: string }> }

function parseSheet(xml: string, shared: string[]): Sheet {
  const cells = new Map<string, Cell>()

  for (const [, attrs, body] of xml.matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const ref = attrs.match(/r="([A-Z]+\d+)"/)?.[1]
    if (!ref) continue
    const value = body?.match(/<v>([\s\S]*?)<\/v>/)?.[1]
    if (value === undefined) continue

    const type = attrs.match(/t="([^"]+)"/)?.[1]
    if (type === 's') {
      cells.set(ref, { raw: value, text: shared[Number(value)] ?? '', number: null })
    } else if (type === 'inlineStr') {
      const inline = body?.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? ''
      cells.set(ref, { raw: value, text: decodeEntities(inline), number: null })
    } else {
      const n = Number(value)
      cells.set(ref, {
        raw: value,
        text: null,
        number: Number.isFinite(n) ? n : null,
      })
    }
  }

  const merges: Array<{ from: string; to: string }> = []
  for (const [, ref] of xml.matchAll(/<mergeCell ref="([A-Z]+\d+:[A-Z]+\d+)"\/>/g)) {
    const [from, to] = ref.split(':')
    merges.push({ from, to })
  }

  return { cells, merges }
}

const colOf = (ref: string) => ref.match(/^[A-Z]+/)![0]
const rowOf = (ref: string) => Number(ref.match(/\d+$/)![0])

/**
 * Excel serial date → "YYYY-MM-DD".
 *
 * The epoch is 1899-12-30, not 1900-01-01: the 1900 date system counts a
 * February 29th that never happened, and anchoring two days earlier absorbs it.
 * Built in UTC and read back in UTC so no local timezone shifts the day.
 */
function serialToISODate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial <= 0) return null
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

// --- Documented corrections ------------------------------------------------
// Confirmed against the source, not assumed — the same standard as the
// per-file quirks in import-ledger.
//
// E001-110 sits in the 2024 tab with a receipt date of 2023-01-17. The year is
// a typo: the receipt belongs to 2024, alongside its income date of 2024-01-09.
// Left uncorrected it moves ~S/ 38,871 out of 2024 and into 2023, because the
// tax year is read off the receipt date.
//
// Applied here rather than in the spreadsheet so re-running stays reproducible,
// and only when the sheet still disagrees — fix the date at the source and this
// quietly becomes a no-op.

const CORRECTIONS: Record<string, { receiptDate?: string; incomeDate?: string; reason: string }> = {
  'E001-110': {
    receiptDate: '2024-01-17',
    reason: 'receipt date read 2023-01-17; the year was a typo',
  },
}

// --- Sheet layout ----------------------------------------------------------
// Located by header text rather than fixed offsets, because the 2022 tab has an
// extra heading row and slightly different labels from the rest.

const HEADERS = {
  incomeDate: 'fecha de ingreso',
  receiptDate: 'fecha de recibo',
  rate: 'tipo de cambio',
  description: 'descripción',
  company: 'empresa',
  usd: 'entrada (usd)',
  soles: 'entrada (pen)',
  retentionUsd: 'retención (usd)',
  retentionSoles: 'retención (pen)',
  receiptNumber: 'nro. de recibo',
} as const

type ColumnMap = Partial<Record<keyof typeof HEADERS, string>>

const normalise = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

function findLayout(sheet: Sheet): { headerRow: number; columns: ColumnMap } {
  for (const [ref, cell] of sheet.cells) {
    if (cell.text && normalise(cell.text) === HEADERS.incomeDate) {
      const headerRow = rowOf(ref)
      const columns: ColumnMap = {}
      for (const [otherRef, otherCell] of sheet.cells) {
        if (rowOf(otherRef) !== headerRow || !otherCell.text) continue
        const label = normalise(otherCell.text)
        for (const [key, prefix] of Object.entries(HEADERS)) {
          if (label.startsWith(prefix)) columns[key as keyof typeof HEADERS] = colOf(otherRef)
        }
      }
      return { headerRow, columns }
    }
  }
  throw new Error('Could not find the "Fecha de Ingreso" header row')
}

/** The header block above the table, keyed by its Spanish label. */
function headerValue(sheet: Sheet, headerRow: number, labelPrefix: string): number | null {
  for (const [ref, cell] of sheet.cells) {
    if (rowOf(ref) >= headerRow || colOf(ref) !== 'A' || !cell.text) continue
    if (!normalise(cell.text).startsWith(labelPrefix)) continue
    return sheet.cells.get(`B${rowOf(ref)}`)?.number ?? null
  }
  return null
}

// --- Extraction ------------------------------------------------------------

type ParsedReceipt = {
  row: number
  year: number
  incomeDate: string
  receiptDate: string
  description: string
  company: string
  receiptNumber: string
  usdCents: number
  rate: number
}

type ParsedRetention = {
  month: string
  solesCents: number
  usdCents: number | null
  note: string
  receiptNumbers: string[]
}

type ParsedYear = {
  year: number
  receipts: ParsedReceipt[]
  retentions: ParsedRetention[]
  /** Corrections applied from the CORRECTIONS table above. */
  corrections: string[]
  /** The sheet's own cached figures, used to check the parse. */
  reported: {
    grossSoles: number | null
    grossUsd: number | null
    retainedSoles: number | null
    tax: number | null
  }
  warnings: string[]
}

/** The row span of the merged cell anchored at `ref`, or just its own row. */
function spanOf(sheet: Sheet, ref: string): { first: number; last: number } {
  const merge = sheet.merges.find((m) => m.from === ref)
  if (!merge) return { first: rowOf(ref), last: rowOf(ref) }
  return { first: rowOf(merge.from), last: rowOf(merge.to) }
}

function parseYear(sheet: Sheet): ParsedYear {
  const { headerRow, columns } = findLayout(sheet)
  const warnings: string[] = []
  const corrections: string[] = []

  const required: Array<keyof typeof HEADERS> = ['incomeDate', 'receiptDate', 'rate', 'usd']
  for (const key of required) {
    if (!columns[key]) throw new Error(`Missing the "${HEADERS[key]}" column`)
  }

  const year = sheet.cells.get('B1')?.number
  if (!year) throw new Error('Could not read the year from B1')

  const at = (key: keyof typeof HEADERS, row: number) =>
    columns[key] ? sheet.cells.get(`${columns[key]}${row}`) : undefined

  // --- Receipts
  const receipts: ParsedReceipt[] = []
  const lastRow = Math.max(...[...sheet.cells.keys()].map(rowOf))

  for (let row = headerRow + 1; row <= lastRow; row++) {
    const usd = at('usd', row)?.number
    const rate = at('rate', row)?.number
    const receiptSerial = at('receiptDate', row)?.number
    const incomeSerial = at('incomeDate', row)?.number
    if (usd == null || rate == null || receiptSerial == null) continue

    const receiptDate = serialToISODate(receiptSerial)
    const incomeDate = serialToISODate(incomeSerial ?? receiptSerial)
    if (!receiptDate || !incomeDate) {
      warnings.push(`row ${row}: unreadable date, skipped`)
      continue
    }
    if (usd <= 0 || rate <= 0) {
      warnings.push(`row ${row}: non-positive amount or rate, skipped`)
      continue
    }

    const receiptNumber = (at('receiptNumber', row)?.text ?? '').replace(/\s+/g, '')
    const fix = CORRECTIONS[receiptNumber]

    receipts.push({
      row,
      year,
      incomeDate: fix?.incomeDate ?? incomeDate,
      receiptDate: fix?.receiptDate ?? receiptDate,
      description: at('description', row)?.text ?? '',
      company: at('company', row)?.text ?? '',
      receiptNumber,
      usdCents: Math.round(usd * 100),
      rate,
    })

    // Only worth saying when the sheet still disagrees; once it's fixed at the
    // source the correction stops firing and stops being mentioned.
    if (fix) {
      if (fix.receiptDate && fix.receiptDate !== receiptDate) {
        corrections.push(
          `${receiptNumber}: receipt date ${receiptDate} → ${fix.receiptDate} (${fix.reason})`,
        )
      }
      if (fix.incomeDate && fix.incomeDate !== incomeDate) {
        corrections.push(
          `${receiptNumber}: income date ${incomeDate} → ${fix.incomeDate} (${fix.reason})`,
        )
      }
    }
  }

  // A receipt dated outside its own tab lands its declaration month in a
  // different year from the rest of the sheet. Known ones are handled by
  // CORRECTIONS above; anything else is a new problem and gets surfaced.
  for (const r of receipts) {
    if (r.receiptDate.slice(0, 4) !== String(year)) {
      warnings.push(
        `row ${r.row} (${r.receiptNumber || 'no number'}): receipt date ${r.receiptDate} is outside ${year} — it will import into ${r.receiptDate.slice(0, 4)}`,
      )
    }
  }

  const seen = new Map<string, number[]>()
  for (const r of receipts) {
    if (!r.receiptNumber) continue
    seen.set(r.receiptNumber, [...(seen.get(r.receiptNumber) ?? []), r.row])
  }
  for (const [number, rows] of seen) {
    if (rows.length > 1) {
      warnings.push(
        `${number} appears on ${rows.length} rows (${rows.join(', ')}) — imported as-is so the year still totals correctly, but worth cleaning up`,
      )
    }
  }

  const receiptAt = new Map(receipts.map((r) => [r.row, r]))
  const monthOf = (r: ParsedReceipt) => r.receiptDate.slice(0, 7)

  // --- Retentions
  // Merged cells carry the coverage: one cell spanning two rows is one charge
  // against two receipts. The declaration month comes from the receipts it
  // covers, and several charges landing in one month are summed — SUNAT bills a
  // month at a time, so the monthly sum *is* the month's charge.
  const byMonth = new Map<string, ParsedRetention>()
  const monthEntry = (month: string): ParsedRetention => {
    let entry = byMonth.get(month)
    if (!entry) {
      entry = { month, solesCents: 0, usdCents: null, note: '', receiptNumbers: [] }
      byMonth.set(month, entry)
    }
    return entry
  }

  const covered = (ref: string): ParsedReceipt[] => {
    const { first, last } = spanOf(sheet, ref)
    const out: ParsedReceipt[] = []
    for (let row = first; row <= last; row++) {
      const receipt = receiptAt.get(row)
      if (receipt) out.push(receipt)
    }
    return out
  }

  if (columns.retentionSoles) {
    for (let row = headerRow + 1; row <= lastRow; row++) {
      const ref = `${columns.retentionSoles}${row}`
      const amount = sheet.cells.get(ref)?.number
      // Zero is not a charge — 2023 and 2024 have no retentions at all, and
      // eleven zero rows would just be noise.
      if (amount == null || amount === 0) continue

      const receipts = covered(ref)
      if (receipts.length === 0) {
        warnings.push(`${ref}: retention of ${amount} covers no receipt row, skipped`)
        continue
      }
      const months = [...new Set(receipts.map(monthOf))]
      if (months.length > 1) {
        warnings.push(
          `${ref}: retention spans ${months.join(' and ')} — attributed to ${months[0]}`,
        )
      }
      const entry = monthEntry(months[0])
      entry.solesCents += Math.round(amount * 100)
      for (const r of receipts) {
        if (monthOf(r) === months[0]) entry.receiptNumbers.push(r.receiptNumber)
      }
    }
  }

  if (columns.retentionUsd) {
    for (let row = headerRow + 1; row <= lastRow; row++) {
      const ref = `${columns.retentionUsd}${row}`
      const amount = sheet.cells.get(ref)?.number
      if (amount == null || amount === 0) continue

      const receipts = covered(ref)
      if (receipts.length === 0) {
        warnings.push(`${ref}: dollar payment of ${amount} covers no receipt row, skipped`)
        continue
      }
      const months = [...new Set(receipts.map(monthOf))]
      const entry = monthEntry(months[0])
      entry.usdCents = (entry.usdCents ?? 0) + Math.round(amount * 100)
      // The dollar record groups differently from the soles one: several months
      // were sometimes settled in a single transfer. The whole payment is put on
      // the first month of its span so the year still totals correctly, and the
      // note says what actually happened.
      if (months.length > 1) {
        entry.note = `Paid together with ${months.slice(1).join(', ')}`
      }
    }
  }

  const retentions = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month))

  return {
    year,
    receipts,
    retentions,
    corrections,
    reported: {
      grossSoles: headerValue(sheet, headerRow, 'entradas'),
      grossUsd: sheet.cells.get(`D${rowOfLabel(sheet, headerRow, 'entradas')}`)?.number ?? null,
      retainedSoles: headerValue(sheet, headerRow, 'retención (pen)'),
      tax: headerValue(sheet, headerRow, 'impuesto'),
    },
    warnings,
  }
}

function rowOfLabel(sheet: Sheet, headerRow: number, labelPrefix: string): number {
  for (const [ref, cell] of sheet.cells) {
    if (rowOf(ref) >= headerRow || colOf(ref) !== 'A' || !cell.text) continue
    if (normalise(cell.text).startsWith(labelPrefix)) return rowOf(ref)
  }
  return -1
}

// --- Reporting -------------------------------------------------------------

const soles = (units: number) =>
  `S/${units.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dollars = (units: number) =>
  `$${units.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Cents-level agreement. The sheet's own sums carry float noise of their own. */
const agrees = (a: number, b: number) => Math.abs(a - b) < 0.005

async function main() {
  const args = process.argv.slice(2)
  const flag = (name: string) => args.includes(`--${name}`)
  const value = (name: string) => {
    const i = args.indexOf(`--${name}`)
    return i >= 0 ? args[i + 1] : undefined
  }

  const file = (value('file') ?? '~/Downloads/Taxes Calculations.xlsx').replace(/^~/, os.homedir())
  const teamName = value('team')
  const commit = flag('commit')
  const reset = flag('reset')

  const entries = listEntries(file)
  const shared = entries.includes('xl/sharedStrings.xml')
    ? parseSharedStrings(readEntry(file, 'xl/sharedStrings.xml'))
    : []

  const sheetEntries = entries
    .filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))

  const years: ParsedYear[] = []
  for (const entry of sheetEntries) {
    const sheet = parseSheet(readEntry(file, entry), shared)
    try {
      years.push(parseYear(sheet))
    } catch (err) {
      console.error(`${entry}: ${err instanceof Error ? err.message : err}`)
      process.exit(1)
    }
  }
  years.sort((a, b) => a.year - b.year)

  // --- Check the parse against the sheet's own figures
  console.log(`\nRead ${years.length} year(s) from ${file}\n`)
  const mismatches: string[] = []

  for (const y of years) {
    const grossSoles = y.receipts.reduce((sum, r) => sum + (r.usdCents / 100) * r.rate, 0)
    const grossUsd = y.receipts.reduce((sum, r) => sum + r.usdCents, 0) / 100
    const retainedSoles = y.retentions.reduce((sum, r) => sum + r.solesCents, 0) / 100
    const retainedUsd = y.retentions.reduce((sum, r) => sum + (r.usdCents ?? 0), 0) / 100
    const uit = uitForYear(y.year)
    const tax = uit === null ? null : incomeTax(grossSoles, y.year).totalTaxSoles

    console.log(
      `${y.year}  ${y.receipts.length} receipts, ${y.retentions.length} retention month(s)`,
    )
    console.log(`  gross     ${soles(grossSoles).padStart(16)} / ${dollars(grossUsd).padStart(14)}`)
    console.log(
      `  retained  ${soles(retainedSoles).padStart(16)} / ${dollars(retainedUsd).padStart(14)}`,
    )
    console.log(`  tax       ${tax === null ? 'no UIT on record' : soles(tax).padStart(16)}`)

    const check = (label: string, ours: number, theirs: number | null) => {
      if (theirs === null) {
        console.log(`  ${label}: sheet has no figure to check against`)
        return
      }
      if (agrees(ours, theirs)) {
        console.log(`  ${label}: matches the sheet`)
      } else {
        const line = `${y.year} ${label}: parsed ${ours.toFixed(4)}, sheet says ${theirs.toFixed(4)}`
        mismatches.push(line)
        console.log(`  ${label}: MISMATCH — sheet says ${theirs.toFixed(4)}`)
      }
    }
    check('gross soles', grossSoles, y.reported.grossSoles)
    if (y.reported.grossUsd !== null) check('gross dollars', grossUsd, y.reported.grossUsd)
    check('retained soles', retainedSoles, y.reported.retainedSoles)
    if (tax !== null) check('tax', tax, y.reported.tax)

    for (const c of y.corrections) console.log(`  corrected: ${c}`)
    for (const w of y.warnings) console.log(`  note: ${w}`)
    console.log()
  }

  // --- Retention coverage, so the merged-cell reading is visible before writing
  console.log('Retention coverage:')
  for (const y of years) {
    if (y.retentions.length === 0) {
      console.log(`  ${y.year}  none logged`)
      continue
    }
    for (const r of y.retentions) {
      const usd = r.usdCents === null ? '' : `  paid ${dollars(r.usdCents / 100)}`
      const note = r.note ? `  (${r.note})` : ''
      console.log(
        `  ${r.month}  ${soles(r.solesCents / 100).padStart(13)}  covers ${r.receiptNumbers.join(', ') || '—'}${usd}${note}`,
      )
    }
  }

  // --- How the app will group it
  // The app reads a receipt's year off its receipt_date, the same date that
  // decides the declaration month, so a receipt and its retention can never
  // land in different years. A receipt dated outside its own tab therefore
  // moves — and the app's totals stop matching that tab. Spelling the
  // difference out here is the only way that isn't a surprise later.
  const appYears = new Map<string, { receipts: number; grossSoles: number }>()
  for (const y of years) {
    for (const r of y.receipts) {
      const key = r.receiptDate.slice(0, 4)
      const entry = appYears.get(key) ?? { receipts: 0, grossSoles: 0 }
      entry.receipts++
      entry.grossSoles += (r.usdCents / 100) * r.rate
      appYears.set(key, entry)
    }
  }

  const moved = years.flatMap((y) =>
    y.receipts.filter((r) => r.receiptDate.slice(0, 4) !== String(y.year)),
  )

  if (moved.length > 0) {
    console.log('\nReceipts that will land in a different year from their tab:')
    for (const r of moved) {
      console.log(
        `  ${r.receiptNumber || `row ${r.row}`}: income ${r.incomeDate}, receipt ${r.receiptDate} — leaves ${r.year}, joins ${r.receiptDate.slice(0, 4)}`,
      )
    }
    console.log("\nSo the app will show these per-year figures, not the tabs':")
    for (const [year, entry] of [...appYears.entries()].sort()) {
      const sheet = years.find((y) => String(y.year) === year)
      const sheetGross = sheet?.reported.grossSoles ?? null
      const differs = sheetGross !== null && !agrees(entry.grossSoles, sheetGross)
      console.log(
        `  ${year}  ${String(entry.receipts).padStart(2)} receipts  ${soles(entry.grossSoles).padStart(16)}` +
          (differs ? `   (tab says ${soles(sheetGross)})` : ''),
      )
    }
    console.log(
      '\nFix the date in the spreadsheet and re-run, or import as-is and correct it in the app.',
    )
  }

  if (mismatches.length > 0) {
    console.log('\nRefusing to import — the parse disagrees with the spreadsheet:')
    for (const m of mismatches) console.log(`  ${m}`)
    await db.destroy()
    process.exit(1)
  }

  const totalReceipts = years.reduce((n, y) => n + y.receipts.length, 0)
  const totalRetentions = years.reduce((n, y) => n + y.retentions.length, 0)
  console.log(
    `\nEvery figure agrees with the spreadsheet. ${totalReceipts} receipts, ${totalRetentions} retention months.`,
  )

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

  const existing = Number(
    (
      await db
        .selectFrom('income_receipts')
        .select(db.fn.count<number>('id').as('n'))
        .where('team_id', '=', team.id)
        .executeTakeFirst()
    )?.n ?? 0,
  )

  if (existing > 0 && !reset) {
    throw new Error(
      `Team "${team.name}" already has ${existing} income receipts. ` +
        `Pass --reset to replace them, or --team to target another team.`,
    )
  }

  // Receipts and retentions describe one history and are checked as one, so a
  // half-applied import isn't a useful state.
  await db.transaction().execute(async (tx) => {
    if (reset) {
      await tx.deleteFrom('tax_retentions').where('team_id', '=', team.id).execute()
      await tx.deleteFrom('income_receipts').where('team_id', '=', team.id).execute()
      await tx.deleteFrom('tax_years').where('team_id', '=', team.id).execute()
      console.log(`\nCleared existing income tax data for team "${team.name}"`)
    }

    for (const y of years) {
      if (y.receipts.length > 0) {
        await tx
          .insertInto('income_receipts')
          .values(
            y.receipts.map((r) => ({
              team_id: team.id,
              income_date: r.incomeDate,
              receipt_date: r.receiptDate,
              description: r.description,
              company: r.company,
              receipt_number: r.receiptNumber,
              amount_usd_cents: r.usdCents,
              exchange_rate: String(r.rate),
            })),
          )
          .execute()
      }

      if (y.retentions.length > 0) {
        await tx
          .insertInto('tax_retentions')
          .values(
            y.retentions.map((r) => ({
              team_id: team.id,
              month: r.month,
              amount_soles_cents: r.solesCents,
              amount_usd_cents: r.usdCents,
              note: r.note,
            })),
          )
          .execute()
      }
    }
  })

  console.log(`\nImported ${totalReceipts} receipts and ${totalRetentions} retention months.`)
  console.log('The per-year regularization rate is set in the app, not here.')
  await db.destroy()
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err)
  await db.destroy().catch(() => {})
  process.exit(1)
})
