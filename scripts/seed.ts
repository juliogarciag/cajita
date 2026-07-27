import 'dotenv/config'
import { db } from '#/db/index.js'

// Seeds the Default team with 3 expense categories — Health, Puppy, Goodies —
// each with ~3k items spread across the last 7 years, and a note on every
// item. Re-runnable: existing items in these categories are wiped and
// regenerated (notes cascade).
//
// Currency model: USD is the settled amount. An item with a soles amount but
// no USD amount is "pending" — money not exchanged yet — so those are rare and
// capped per year.

const YEARS_BACK = 7
const ITEMS_PER_CATEGORY_MIN = 2800
const ITEMS_PER_CATEGORY_MAX = 3100
const PENDING_PER_YEAR_MIN = 1
const PENDING_PER_YEAR_MAX = 5
// Share of settled items that also record what was paid in soles before
// exchanging. The rest were paid in USD directly (subscriptions, online).
const SOLES_ALONGSIDE_USD_PROBABILITY = 0.75

type CategorySpec = {
  name: string
  color: string
  descriptions: string[]
  // Amount ranges in whole units (soles / usd)
  solesRange: [number, number]
  usdRange: [number, number]
  notes: string[]
}

// Notes that fit any category
const GENERIC_NOTES = [
  'Paid with the blue card.',
  'Reimbursed later.',
  'Split with Angie.',
  'Cheaper than last time.',
  'Bought on sale.',
  'Kept the receipt.',
  'Ordered online, delivered same week.',
  'Same as the usual monthly one.',
  'Slightly over budget this month.',
  'Worth it.',
]

// Notes for soles-only (pending) items — money not exchanged yet
const PENDING_NOTES = [
  'Paid in soles — not exchanged yet.',
  'Used cash we already had at home.',
  'Pending: need to work out the exchange rate for this one.',
  'Paid from the soles account, still to reconcile.',
  'Covered with leftover soles from the trip.',
]

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
    notes: [
      'Insurance covered part of it.',
      'Follow-up scheduled in a month.',
      'Ask for the generic next time.',
      'Results came back fine.',
      'Clinic in San Isidro.',
      'Needed a referral for this one.',
      'Annual checkup, nothing unusual.',
      'Prescription lasts three months.',
    ],
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
    notes: [
      'She loved it.',
      'Lasts about six weeks.',
      'Same brand as always.',
      'Vet said to repeat in a month.',
      'Bigger bag works out cheaper.',
      'Destroyed it in two days.',
      'Next appointment in six months.',
      'Bought two, one for the trip.',
    ],
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
    notes: [
      'Weekend treat.',
      'The place near the park.',
      'Shared, but barely.',
      'Better than the last one we tried.',
      'Too sweet, not again.',
      'Celebrating the end of the week.',
      'Bought on the way home.',
      'Would go back for this.',
    ],
  },
]

// --- Helpers ---------------------------------------------------------------

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomItem<T>(list: T[]): T {
  return list[randomInt(0, list.length - 1)]
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

// Note content is Tiptap HTML.
function buildNoteHtml(spec: CategorySpec, isPending: boolean): string {
  const first = isPending ? randomItem(PENDING_NOTES) : randomItem(spec.notes)
  // Roughly a third of notes get a second line from the generic pool.
  if (Math.random() < 0.33) {
    return `<p>${first}</p><p>${randomItem(GENERIC_NOTES)}</p>`
  }
  return `<p>${first}</p>`
}

// --- Seed ------------------------------------------------------------------

async function seed() {
  const team = await db
    .selectFrom('teams')
    .select('id')
    .where('is_default', '=', true)
    .executeTakeFirstOrThrow()

  console.log(`Seeding into Default team ${team.id}`)

  // Attribute notes to a member of the team, when there is one
  const member = await db
    .selectFrom('team_memberships')
    .select('user_id')
    .where('team_id', '=', team.id)
    .executeTakeFirst()
  const authorId = member?.user_id ?? null

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

    const rows = Array.from({ length: count }, () => ({
      description: randomItem(spec.descriptions),
      date: randomDateWithinYears(YEARS_BACK),
    }))

    // The UI orders by sort_position — assign it in date order
    rows.sort((a, b) => a.date.localeCompare(b.date))

    // Pick the handful of pending (soles-only) items per year
    const indicesByYear = new Map<string, number[]>()
    rows.forEach((row, i) => {
      const year = row.date.slice(0, 4)
      const list = indicesByYear.get(year) ?? []
      list.push(i)
      indicesByYear.set(year, list)
    })

    const pendingIndices = new Set<number>()
    for (const indices of indicesByYear.values()) {
      const target = Math.min(randomInt(PENDING_PER_YEAR_MIN, PENDING_PER_YEAR_MAX), indices.length)
      const chosen = new Set<number>()
      while (chosen.size < target) chosen.add(randomItem(indices))
      for (const i of chosen) pendingIndices.add(i)
    }

    const values = rows.map((row, i) => {
      const isPending = pendingIndices.has(i)
      const soles =
        isPending || Math.random() < SOLES_ALONGSIDE_USD_PROBABILITY
          ? randomAmountCents(spec.solesRange[0], spec.solesRange[1])
          : null

      return {
        team_id: team.id,
        expense_category_id: category.id,
        description: row.description,
        date: row.date,
        amount_soles_cents: soles,
        // Pending items are exactly the ones still missing a USD amount
        amount_usd_cents: isPending ? null : randomAmountCents(spec.usdRange[0], spec.usdRange[1]),
        sort_position: (i + 1) * 1000,
      }
    })

    const CHUNK = 500
    const itemIds: string[] = []
    for (let i = 0; i < values.length; i += CHUNK) {
      const inserted = await db
        .insertInto('expense_items')
        .values(values.slice(i, i + CHUNK))
        .returning('id')
        .execute()
      itemIds.push(...inserted.map((r) => r.id))
    }

    // One note per item
    const noteValues = itemIds.map((itemId, i) => ({
      expense_item_id: itemId,
      team_id: team.id,
      content: buildNoteHtml(spec, pendingIndices.has(i)),
      created_by_user_id: authorId,
      updated_by_user_id: authorId,
    }))

    for (let i = 0; i < noteValues.length; i += CHUNK) {
      await db
        .insertInto('expense_item_notes')
        .values(noteValues.slice(i, i + CHUNK))
        .execute()
    }

    console.log(`  ${spec.name}: ${count} items (${pendingIndices.size} pending), ${count} notes`)
  }

  await db.destroy()
  console.log('Done.')
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
