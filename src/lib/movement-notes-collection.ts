import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'
import { z } from 'zod'

const movementNoteSchema = z.object({
  id: z.string(),
  movement_id: z.string(),
  team_id: z.string(),
  content: z.string(),
  created_by_user_id: z.string().nullable(),
  updated_by_user_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})

export type MovementNote = z.infer<typeof movementNoteSchema>

export const movementNotesCollection = createCollection(
  electricCollectionOptions({
    id: 'movement_notes',
    shapeOptions: {
      url:
        typeof window !== 'undefined'
          ? `${window.location.origin}/api/electric/movement_notes`
          : '/api/electric/movement_notes',
    },
    getKey: (item: MovementNote) => item.id,
    schema: movementNoteSchema,
  }),
)
