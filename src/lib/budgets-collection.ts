import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'
import { z } from 'zod'

const budgetSchema = z.object({
  id: z.string(),
  category_id: z.string(),
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
      url:
        typeof window !== 'undefined'
          ? `${window.location.origin}/api/electric/budgets`
          : '/api/electric/budgets',
    },
    getKey: (item: Budget) => item.id,
    schema: budgetSchema,
  }),
)
