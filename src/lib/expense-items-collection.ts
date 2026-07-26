import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'
import { z } from 'zod'
import { electricShapeUrl } from '#/lib/electric-url'

const expenseItemSchema = z.object({
  id: z.string(),
  expense_category_id: z.string(),
  description: z.string(),
  date: z.string(),
  amount_soles_cents: z.coerce.number().nullable(),
  amount_usd_cents: z.coerce.number().nullable(),
  sort_position: z.coerce.number(),
  created_at: z.string(),
  updated_at: z.string(),
})

export type ExpenseItem = z.infer<typeof expenseItemSchema>

// Read-only collection — expense items are managed via server functions
export const expenseItemsCollection = createCollection(
  electricCollectionOptions({
    id: 'expense_items',
    shapeOptions: {
      url: electricShapeUrl('expense_items'),
    },
    getKey: (item: ExpenseItem) => item.id,
    schema: expenseItemSchema,
  }),
)
