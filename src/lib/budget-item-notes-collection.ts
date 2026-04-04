import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'
import { z } from 'zod'

const budgetItemNoteSchema = z.object({
  id: z.string(),
  budget_item_id: z.string(),
  team_id: z.string(),
  content: z.string(),
  created_by_user_id: z.string().nullable(),
  updated_by_user_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})

export type BudgetItemNote = z.infer<typeof budgetItemNoteSchema>

export const budgetItemNotesCollection = createCollection(
  electricCollectionOptions({
    id: 'budget_item_notes',
    shapeOptions: {
      url:
        typeof window !== 'undefined'
          ? `${window.location.origin}/api/electric/budget_item_notes`
          : '/api/electric/budget_item_notes',
    },
    getKey: (item: BudgetItemNote) => item.id,
    schema: budgetItemNoteSchema,
  }),
)
