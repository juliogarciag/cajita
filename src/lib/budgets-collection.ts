import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'
import { z } from 'zod'
import { electricShapeUrl } from '#/lib/electric-url'

const budgetSchema = z.object({
  id: z.string(),
  category_id: z.string(),
  name: z.string(),
  year: z.coerce.number(),
  annual_amount_cents: z.coerce.number(),
  remaining_movement_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})

export type Budget = z.infer<typeof budgetSchema>

// Read-only collection — budgets are created/updated/deleted via server functions
export const budgetsCollection = createCollection(
  electricCollectionOptions({
    id: 'budgets',
    shapeOptions: {
      url: electricShapeUrl('budgets'),
    },
    getKey: (item: Budget) => item.id,
    schema: budgetSchema,
  }),
)
