import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'
import { z } from 'zod'
import { electricShapeUrl } from '#/lib/electric-url'

const taxRetentionSchema = z.object({
  id: z.string(),
  month: z.string(),
  amount_soles_cents: z.coerce.number(),
  amount_usd_cents: z.coerce.number().nullable(),
  note: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
})

export type TaxRetention = z.infer<typeof taxRetentionSchema>

// Read-only collection — retentions are written through server functions
export const taxRetentionsCollection = createCollection(
  electricCollectionOptions({
    id: 'tax_retentions',
    shapeOptions: {
      url: electricShapeUrl('tax_retentions'),
    },
    getKey: (item: TaxRetention) => item.id,
    schema: taxRetentionSchema,
  }),
)
