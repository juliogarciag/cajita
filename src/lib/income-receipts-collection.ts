import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'
import { z } from 'zod'
import { electricShapeUrl } from '#/lib/electric-url'

const incomeReceiptSchema = z.object({
  id: z.string(),
  income_date: z.string(),
  receipt_date: z.string(),
  description: z.string(),
  company: z.string(),
  receipt_number: z.string(),
  amount_usd_cents: z.coerce.number(),
  // Postgres `numeric` arrives as a string ("3.965000") and this schema only
  // validates writes — it does not transform synced rows. Typed honestly here;
  // `normalizeReceipt` is what turns it into a number on the way in.
  exchange_rate: z.union([z.string(), z.number()]),
  created_at: z.string(),
  updated_at: z.string(),
})

export type RawIncomeReceipt = z.infer<typeof incomeReceiptSchema>
export type IncomeReceipt = RawIncomeReceipt & { exchange_rate: number }

// Read-only collection — receipts are written through server functions
export const incomeReceiptsCollection = createCollection(
  electricCollectionOptions({
    id: 'income_receipts',
    shapeOptions: {
      url: electricShapeUrl('income_receipts'),
    },
    getKey: (item: RawIncomeReceipt) => item.id,
    schema: incomeReceiptSchema,
  }),
)
