import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'csv-parse/sync'
import { Kysely, PostgresDialect, sql } from 'kysely'
import pg from 'pg'
import type { Database } from '../src/db/schema.js'

// ---------------------------------------------------------------------------
// DB connection
// ---------------------------------------------------------------------------
const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: new pg.Pool({ connectionString: process.env.DATABASE_URL }),
  }),
})

// ---------------------------------------------------------------------------
// Budget definitions per year (annual amounts in cents)
// ---------------------------------------------------------------------------
const BUDGETS: Record<number, Record<string, number>> = {
  2023: {
    Goodies: 8_600_00,
    Salud: 5_200_00,
    'Goodies Raros': 7_000_00,
    Mejoras: 12_600_00,
    Puppy: 2_700_00,
    Educación: 1_700_00,
  },
  2024: {
    Puppy: 4_200_00,
    Health: 5_200_00,
    'House Improvements': 4_300_00,
    Goodies: 8_100_00,
    'Big Goodies': 5_700_00,
  },
  2025: {
    Puppy: 2_550_00,
    Health: 8_747_61,
    'House Improvements': 3_717_00,
    Goodies: 8_673_74,
    'Discretionary Expenses': 3_000_00,
  },
}

// Default color palette for categories/budgets
const COLORS = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#84cc16',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#a855f7',
  '#ec4899',
  '#f43f5e',
  '#78716c',
  '#64748b',
]

// ---------------------------------------------------------------------------
// Category name normalization for 2017-2022 balance entries
// ---------------------------------------------------------------------------
const CATEGORY_REMAP: Record<string, string> = {
  'positive balance': 'Free Income',
  'Positive balance': 'Free Income',
  'negative balance': 'Free Expense',
}

// ---------------------------------------------------------------------------
// CSV parsing helpers
// ---------------------------------------------------------------------------

interface RawMovement {
  description: string
  date: string // YYYY-MM-DD
  amountCents: number
  category: string
}

/** Parse US dollar string: "$ 7,947.64", "$ -500.00", "$18,482.24", "-$11.59", "$ -" */
function parseUSD(raw: string): number {
  const cleaned = raw.replace(/[$\s,]/g, '')
  if (cleaned === '-' || cleaned === '' || cleaned === '+') return 0
  return Math.round(parseFloat(cleaned) * 100)
}

/** Parse Latin dollar string: "$6.051,90", "-$600,00" */
function parseLatinUSD(raw: string): number {
  const cleaned = raw
    .replace(/[$\s]/g, '')
    .replace(/\./g, '') // remove thousand separators
    .replace(',', '.') // decimal comma → decimal point
  return Math.round(parseFloat(cleaned) * 100)
}

/** Parse MM/DD/YYYY → YYYY-MM-DD */
function parseMDY(raw: string): string {
  const [m, d, y] = raw.trim().split('/')
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

/** Parse DD / MM / YYYY (with spaces) → YYYY-MM-DD */
function parseLatinDate(raw: string): string {
  const parts = raw.trim().split(/\s*\/\s*/)
  const [d, m, y] = parts
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function parseFile2017to2022(filePath: string): RawMovement[] {
  const content = fs.readFileSync(filePath, 'utf-8')
  const records: string[][] = parse(content, {
    relax_column_count: true,
    skip_empty_lines: true,
  })

  return records.map((row) => {
    // Columns: Description, Date, Amount, Total, ✔︎, Category
    const description = row[0].trim()
    const date = parseMDY(row[1])
    const amountCents = parseUSD(row[2])
    const rawCategory = row[row.length - 1].trim()
    const category = CATEGORY_REMAP[rawCategory] ?? rawCategory

    return { description, date, amountCents, category }
  })
}

function parseFile2023(filePath: string): RawMovement[] {
  const content = fs.readFileSync(filePath, 'utf-8')
  const records: string[][] = parse(content, {
    relax_column_count: true,
    skip_empty_lines: true,
  })

  // Skip header row. Use running total delta as amount source of truth
  // because at least one row has an incorrect amount column.
  const dataRows = records.slice(1)
  let prevTotal = 0
  return dataRows.map((row, i) => {
    const description = row[0].trim()
    const date = parseLatinDate(row[1])
    const csvTotal = parseLatinUSD(row[3])
    const amountCents = i === 0 ? csvTotal : csvTotal - prevTotal
    prevTotal = csvTotal
    const rawCategory = row[row.length - 1].trim()

    return { description, date, amountCents, category: rawCategory }
  })
}

/** Parse DD/MM/YYYY (no spaces) → YYYY-MM-DD */
function parseDMY(raw: string): string {
  const [d, m, y] = raw.trim().split('/')
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function parseFile2024or2025(filePath: string): RawMovement[] {
  const content = fs.readFileSync(filePath, 'utf-8')
  const records: string[][] = parse(content, {
    relax_column_count: true,
    skip_empty_lines: true,
  })

  // Skip header row, skip [Remaining] entries
  return records
    .slice(1)
    .filter((row) => !row[0].trim().startsWith('[Remaining]'))
    .map((row) => {
      const description = row[0].trim()
      const date = parseDMY(row[1])
      const amountCents = parseUSD(row[2])
      const rawCategory = row[row.length - 1].trim()

      return { description, date, amountCents, category: rawCategory }
    })
}

// ---------------------------------------------------------------------------
// Main migration
// ---------------------------------------------------------------------------
async function main() {
  const dataDir = process.env.MIGRATE_DATA_DIR_PATH

  if (!dataDir) {
    throw new Error('MIGRATE_DATA_DIR_PATH environment variable is not set')
  }

  console.log('Parsing CSV files...')
  const movements2017 = parseFile2017to2022(path.join(dataDir, 'f2017-2022.csv'))
  const movements2023 = parseFile2023(path.join(dataDir, 'f2023.csv'))
  const movements2024 = parseFile2024or2025(path.join(dataDir, 'f2024.csv'))
  const movements2025 = parseFile2024or2025(path.join(dataDir, 'f2025.csv'))

  // Skip "Initial"/"Inicial" carry-forward entries from 2023-2025
  // (those balances are already accounted for by prior year movements)
  const skipInitial = (movements: RawMovement[]) =>
    movements.filter((m) => !/^Iniciale?s?$|^Initial$/i.test(m.description))

  const allMovements = [
    ...movements2017,
    ...skipInitial(movements2023),
    ...skipInitial(movements2024),
    ...skipInitial(movements2025),
  ]

  console.log(`Parsed ${allMovements.length} movements total:`)
  console.log(`  2017-2022: ${movements2017.length}`)
  console.log(`  2023:      ${movements2023.length}`)
  console.log(`  2024:      ${movements2024.length}`)
  console.log(`  2025:      ${movements2025.length}`)

  // Collect unique category names
  const categoryNames = [...new Set(allMovements.map((m) => m.category))]
  console.log(`\nFound ${categoryNames.length} unique categories:`)
  for (const name of categoryNames.sort()) {
    console.log(`  - ${name}`)
  }

  // Collect budget category names
  const budgetCategoryNames = new Set<string>()
  for (const budgets of Object.values(BUDGETS)) {
    for (const name of Object.keys(budgets)) {
      budgetCategoryNames.add(name)
    }
  }

  // ---------------------------------------------------------------------------
  // Resolve team
  // ---------------------------------------------------------------------------
  const team = await db
    .selectFrom('teams')
    .select('id')
    .where('is_default', '=', true)
    .executeTakeFirst()

  if (!team) {
    throw new Error('No default team found. Make sure the is_default migration has been run.')
  }

  const teamId = team.id
  console.log(`\nUsing default team: ${teamId}`)

  // ---------------------------------------------------------------------------
  // Wipe existing data (order matters for FK constraints)
  // ---------------------------------------------------------------------------
  console.log('\nWiping existing data...')
  await db
    .deleteFrom('budget_items')
    .where('budget_id', 'in', (qb) =>
      qb.selectFrom('budgets').select('id').where('team_id', '=', teamId),
    )
    .execute()
  await db.deleteFrom('budgets').where('team_id', '=', teamId).execute()
  await db.deleteFrom('checkpoints').where('team_id', '=', teamId).execute()
  await db.deleteFrom('snapshots').where('team_id', '=', teamId).execute()
  await db.deleteFrom('movements').where('team_id', '=', teamId).execute()
  await db.deleteFrom('categories').where('team_id', '=', teamId).execute()
  console.log('Done.')

  // ---------------------------------------------------------------------------
  // Create categories
  // ---------------------------------------------------------------------------
  console.log('\nCreating categories...')
  const categoryMap = new Map<string, string>() // name → id
  let colorIdx = 0

  for (const name of categoryNames) {
    const color = COLORS[colorIdx % COLORS.length]
    colorIdx++
    const result = await db
      .insertInto('categories')
      .values({ team_id: teamId, name, color, sort_order: colorIdx })
      .returning('id')
      .executeTakeFirstOrThrow()
    categoryMap.set(name, result.id)
  }

  console.log(`Created ${categoryMap.size} categories.`)

  // ---------------------------------------------------------------------------
  // Create budgets (2023, 2024, 2025)
  // ---------------------------------------------------------------------------
  console.log('\nCreating budgets...')
  let budgetCount = 0

  for (const [yearStr, budgetDefs] of Object.entries(BUDGETS)) {
    const year = parseInt(yearStr)
    for (const [name, annualCents] of Object.entries(budgetDefs)) {
      const categoryId = categoryMap.get(name)
      if (!categoryId) {
        console.warn(`  WARNING: No category found for budget "${name}" (${year}), skipping`)
        continue
      }
      await db
        .insertInto('budgets')
        .values({
          team_id: teamId,
          category_id: categoryId,
          name,
          year,
          annual_amount_cents: annualCents,
        })
        .execute()
      budgetCount++
    }
  }

  // Build budget lookup: (categoryName, year) → budget_id
  const budgetMap = new Map<string, string>() // "categoryName:year" → budget_id
  const allBudgets = await db.selectFrom('budgets').selectAll().execute()
  for (const b of allBudgets) {
    const catName = [...categoryMap.entries()].find(([, id]) => id === b.category_id)?.[0]
    if (catName) budgetMap.set(`${catName}:${b.year}`, b.id)
  }

  console.log(`Created ${budgetCount} budgets.`)

  // ---------------------------------------------------------------------------
  // Insert movements and budget items
  // ---------------------------------------------------------------------------
  console.log('\nInserting movements...')

  // Insert movements one batch at a time, returning IDs for budget_item linking
  const BATCH_SIZE = 100
  let budgetItemCount = 0

  for (let i = 0; i < allMovements.length; i += BATCH_SIZE) {
    const batch = allMovements.slice(i, i + BATCH_SIZE)
    const inserted = await db
      .insertInto('movements')
      .values(
        batch.map((m, j) => ({
          team_id: teamId,
          description: m.description,
          date: m.date,
          amount_cents: m.amountCents,
          category_id: categoryMap.get(m.category) ?? null,
          sort_position: i + j + 1,
          source: 'import',
        })),
      )
      .returning(['id', 'date', 'amount_cents', 'description'])
      .execute()

    // Create budget_items for movements that belong to a budget category
    const budgetItems = inserted
      .map((row, j) => {
        const m = batch[j]
        const year = parseInt(m.date.slice(0, 4))
        const budgetId = budgetMap.get(`${m.category}:${year}`)
        if (!budgetId) return null
        return {
          budget_id: budgetId,
          description: row.description,
          date: m.date,
          amount_cents: row.amount_cents,
          accounting_date: m.date,
          movement_id: row.id,
          sort_position: i + j + 1,
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)

    if (budgetItems.length > 0) {
      await db.insertInto('budget_items').values(budgetItems).execute()
      budgetItemCount += budgetItems.length
    }
  }

  console.log(`Inserted ${allMovements.length} movements.`)
  console.log(`Created ${budgetItemCount} budget items.`)

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  const mvCount = await db
    .selectFrom('movements')
    .select(sql<number>`count(*)`.as('count'))
    .executeTakeFirstOrThrow()
  const catCount = await db
    .selectFrom('categories')
    .select(sql<number>`count(*)`.as('count'))
    .executeTakeFirstOrThrow()
  const budCount = await db
    .selectFrom('budgets')
    .select(sql<number>`count(*)`.as('count'))
    .executeTakeFirstOrThrow()
  const biCount = await db
    .selectFrom('budget_items')
    .select(sql<number>`count(*)`.as('count'))
    .executeTakeFirstOrThrow()
  const totalCents = await db
    .selectFrom('movements')
    .select(sql<number>`sum(amount_cents)`.as('total'))
    .executeTakeFirstOrThrow()

  console.log('\n--- Migration complete ---')
  console.log(`  Movements:    ${mvCount.count}`)
  console.log(`  Categories:   ${catCount.count}`)
  console.log(`  Budgets:      ${budCount.count}`)
  console.log(`  Budget Items: ${biCount.count}`)
  console.log(`  Final Total:  $${(Number(totalCents.total) / 100).toFixed(2)}`)

  await db.destroy()
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
