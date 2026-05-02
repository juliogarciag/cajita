import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'
import { z } from 'zod'
import { electricShapeUrl } from '#/lib/electric-url'

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
      url: electricShapeUrl('budget_items'),
    },
    getKey: (item: BudgetItem) => item.id,
    schema: budgetItemSchema,
  }),
)
