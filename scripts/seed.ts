import 'dotenv/config'
import { db } from '#/db/index.js'

// Seeds the Default team with 3 expense categories — Health, Puppy, Goodies —
// each with ~3k items spread across the last 7 years. Re-runnable: existing
// items in these categories are wiped and regenerated.

const YEARS_BACK = 7
const ITEMS_PER_CATEGORY_MIN = 2800
const ITEMS_PER_CATEGORY_MAX = 3100

type CategorySpec = {
  name: string
  color: string
  descriptions: string[]
  // Amount ranges in whole units (soles / usd)
  solesRange: [number, number]
  usdRange: [number, number]
  // Probability an item is priced in soles (else usd); ~10% get both
  solesProbability: number
}

const CATEGORIES: CategorySpec[] = [
  {
    name: 'Health',
    color: '#ef4444', // Red
    descriptions: [
      'Pharmacy — ibuprofen',
      'Pharmacy — antibiotics',
      'Pharmacy — vitamins',
      'Pharmacy — allergy meds',
      'Doctor appointment',
      'Dermatologist visit',
      'Dentist cleaning',
      'Dentist — filling',
      'Eye exam',
      'New glasses',
      'Contact lenses',
      'Blood test panel',
      'X-ray',
      'Physical therapy session',
      'Therapy session',
      'Nutritionist consult',
      'Gym membership',
      'Yoga class pack',
      'Massage — back pain',
      'Vaccination',
      'Health insurance copay',
      'Urgent care visit',
      'Lab work',
      'Sunscreen and skincare',
      'First aid supplies',
    ],
    solesRange: [15, 900],
    usdRange: [10, 350],
    solesProbability: 0.75,
  },
  {
    name: 'Puppy',
    color: '#f59e0b', // Amber
    descriptions: [
      'Dog food — 15kg bag',
      'Dog food — wet cans',
      'Treats — chicken strips',
      'Treats — dental chews',
      'Vet checkup',
      'Vet — vaccines',
      'Vet — deworming',
      'Flea and tick treatment',
      'Grooming session',
      'Nail trimming',
      'New leash',
      'New harness',
      'Poop bags — bulk',
      'Chew toy',
      'Squeaky toy',
      'Dog bed',
      'Blanket for crate',
      'Dog shampoo',
      'Training session',
      'Dog walker — week',
      'Pet sitter — weekend',
      'Kennel boarding',
      'Water fountain filter',
      'Puppy pads',
      'Antipulgas pipette',
    ],
    solesRange: [10, 600],
    usdRange: [8, 200],
    solesProbability: 0.85,
  },
  {
    name: 'Goodies',
    color: '#ec4899', // Pink
    descriptions: [
      'Bubble tea',
      'Ice cream run',
      'Chocolate bar stash',
      'Croissants and coffee',
      'Cheesecake slice',
      'Donuts — half dozen',
      'Alfajores',
      'Picarones',
      'Churros',
      'Movie night snacks',
      'Candy store haul',
      'Fancy cookies',
      'Gelato',
      'Cinnamon rolls',
      'Brownies',
      'Frappuccino',
      'Milkshake',
      'Waffles with fruit',
      'Crepes',
      'Popcorn — caramel',
      'Macarons',
      'Tres leches cake',
      'Suspiro a la limeña',
      'Panetón',
      'King Kong de manjar',
    ],
    solesRange: [5, 120],
    usdRange: [3, 40],
    solesProbability: 0.9,
  },
]

// --- Helpers ---------------------------------------------------------------

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// Random amount in cents, biased toward the lower end of the range (most
// expenses are small; a few are big).
function randomAmountCents(min: number, max: number): number {
  const t = Math.pow(Math.random(), 2.2)
  const units = min + (max - min) * t
  return Math.round(units * 100)
}

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function randomDateWithinYears(yearsBack: number): string {
  const now = Date.now()
  const start = new Date()
  start.setFullYear(start.getFullYear() - yearsBack)
  const ts = randomInt(start.getTime(), now)
  return toISODate(new Date(ts))
}

// --- Seed ------------------------------------------------------------------

async function seed() {
  const team = await db
    .selectFrom('teams')
    .select('id')
    .where('is_default', '=', true)
    .executeTakeFirstOrThrow()

  console.log(`Seeding into Default team ${team.id}`)

  for (const spec of CATEGORIES) {
    // Upsert category by (team, name)
    let category = await db
      .selectFrom('expense_categories')
      .select(['id'])
      .where('team_id', '=', team.id)
      .where('name', '=', spec.name)
      .executeTakeFirst()

    if (category) {
      await db
        .updateTable('expense_categories')
        .set({ color: spec.color, updated_at: new Date() })
        .where('id', '=', category.id)
        .execute()
    } else {
      category = await db
        .insertInto('expense_categories')
        .values({ team_id: team.id, name: spec.name, color: spec.color })
        .returning('id')
        .executeTakeFirstOrThrow()
    }

    // Re-runnable: wipe previous items (notes cascade)
    await db.deleteFrom('expense_items').where('expense_category_id', '=', category.id).execute()

    const count = randomInt(ITEMS_PER_CATEGORY_MIN, ITEMS_PER_CATEGORY_MAX)

    const rows = Array.from({ length: count }, () => {
      const description = spec.descriptions[randomInt(0, spec.descriptions.length - 1)]
      const date = randomDateWithinYears(YEARS_BACK)

      const inSoles = Math.random() < spec.solesProbability
      const both = Math.random() < 0.1

      const amount_soles_cents =
        inSoles || both ? randomAmountCents(spec.solesRange[0], spec.solesRange[1]) : null
      const amount_usd_cents =
        !inSoles || both ? randomAmountCents(spec.usdRange[0], spec.usdRange[1]) : null

      return { description, date, amount_soles_cents, amount_usd_cents }
    })

    // The UI orders by sort_position — assign it in date order
    rows.sort((a, b) => a.date.localeCompare(b.date))

    const values = rows.map((row, i) => ({
      team_id: team.id,
      expense_category_id: category.id,
      ...row,
      sort_position: (i + 1) * 1000,
    }))

    const CHUNK = 500
    for (let i = 0; i < values.length; i += CHUNK) {
      await db
        .insertInto('expense_items')
        .values(values.slice(i, i + CHUNK))
        .execute()
    }

    console.log(`  ${spec.name}: ${count} items`)
  }

  await db.destroy()
  console.log('Done.')
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
