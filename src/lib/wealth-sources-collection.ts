import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'
import { z } from 'zod'
import { electricShapeUrl } from '#/lib/electric-url'

const wealthSourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  sort_order: z.coerce.number(),
  archived: z.coerce.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
})

export type WealthSource = z.infer<typeof wealthSourceSchema>

// Read-only collection — sources are managed via server functions
export const wealthSourcesCollection = createCollection(
  electricCollectionOptions({
    id: 'wealth_sources',
    shapeOptions: {
      url: electricShapeUrl('wealth_sources'),
    },
    getKey: (item: WealthSource) => item.id,
    schema: wealthSourceSchema,
  }),
)
