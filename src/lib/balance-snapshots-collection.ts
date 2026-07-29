import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'
import { z } from 'zod'
import { electricShapeUrl } from '#/lib/electric-url'

const balanceSnapshotSchema = z.object({
  id: z.string(),
  date: z.string(),
  /** Optional for the same reason as the other added columns: a shape Electric
   *  cached before migration 009 serves rows without the key. */
  label: z.string().optional(),
  locked: z.coerce.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
})

export type BalanceSnapshot = z.infer<typeof balanceSnapshotSchema>

// Read-only collection — readings are managed via server functions
export const balanceSnapshotsCollection = createCollection(
  electricCollectionOptions({
    id: 'balance_snapshots',
    shapeOptions: {
      url: electricShapeUrl('balance_snapshots'),
    },
    getKey: (item: BalanceSnapshot) => item.id,
    schema: balanceSnapshotSchema,
  }),
)
