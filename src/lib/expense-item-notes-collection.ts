import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'
import { z } from 'zod'
import { electricShapeUrl } from '#/lib/electric-url'

const expenseItemNoteSchema = z.object({
  id: z.string(),
  expense_item_id: z.string(),
  team_id: z.string(),
  content: z.string(),
  created_by_user_id: z.string().nullable(),
  updated_by_user_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})

export type ExpenseItemNote = z.infer<typeof expenseItemNoteSchema>

export const expenseItemNotesCollection = createCollection(
  electricCollectionOptions({
    id: 'expense_item_notes',
    shapeOptions: {
      url: electricShapeUrl('expense_item_notes'),
    },
    getKey: (item: ExpenseItemNote) => item.id,
    schema: expenseItemNoteSchema,
  }),
)
