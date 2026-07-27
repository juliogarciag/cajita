import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'
import { z } from 'zod'
import { electricShapeUrl } from '#/lib/electric-url'

const balanceEntrySchema = z.object({
  id: z.string(),
  balance_snapshot_id: z.string(),
  wealth_source_id: z.string(),
  amount_usd_cents: z.coerce.number(),
  created_at: z.string(),
  updated_at: z.string(),
})

export type BalanceEntry = z.infer<typeof balanceEntrySchema>

// Read-only collection — entries are managed via server functions
export const balanceEntriesCollection = createCollection(
  electricCollectionOptions({
    id: 'balance_entries',
    shapeOptions: {
      url: electricShapeUrl('balance_entries'),
    },
    getKey: (item: BalanceEntry) => item.id,
    schema: balanceEntrySchema,
  }),
)
