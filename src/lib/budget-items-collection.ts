import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'
import { z } from 'zod'

const budgetItemSchema = z.object({
  id: z.string(),
  budget_id: z.string(),
  description: z.string(),
  date: z.string(),
  amount_local_cents: z.coerce.number().nullable(),
  amount_cents: z.coerce.number(),
  accounting_date: z.string().nullable(),
  movement_id: z.string().nullable(),
  sort_position: z.coerce.number(),
  created_at: z.string(),
  updated_at: z.string(),
})

export type BudgetItem = z.infer<typeof budgetItemSchema>

// Read-only collection — budget items are managed via server functions
export const budgetItemsCollection = createCollection(
  electricCollectionOptions({
    id: 'budget_items',
    shapeOptions: {
      url:
        typeof window !== 'undefined'
          ? `${window.location.origin}/api/electric/budget_items`
          : '/api/electric/budget_items',
    },
    getKey: (item: BudgetItem) => item.id,
    schema: budgetItemSchema,
  }),
)
