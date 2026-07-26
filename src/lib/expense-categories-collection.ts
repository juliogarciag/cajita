import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'
import { z } from 'zod'
import { electricShapeUrl } from '#/lib/electric-url'

const expenseCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
})

export type ExpenseCategory = z.infer<typeof expenseCategorySchema>

// Read-only collection — categories are created/updated/deleted via server functions
export const expenseCategoriesCollection = createCollection(
  electricCollectionOptions({
    id: 'expense_categories',
    shapeOptions: {
      url: electricShapeUrl('expense_categories'),
    },
    getKey: (item: ExpenseCategory) => item.id,
    schema: expenseCategorySchema,
  }),
)
