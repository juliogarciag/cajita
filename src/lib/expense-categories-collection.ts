import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'
import { z } from 'zod'
import { electricShapeUrl } from '#/lib/electric-url'

const expenseCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  /**
   * Optional, not merely defaulted: a shape Electric cached before migration
   * 006 serves rows without the key, and requiring it would break the whole
   * collection until Electric caught up. Read it as `pinned ?? false`.
   */
  pinned: z.boolean().optional(),
  /** Optional for the same reason as `pinned` — see migration 007. */
  sort_order: z.number().optional(),
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
