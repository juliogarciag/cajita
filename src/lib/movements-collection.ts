import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'
import { z } from 'zod'
import { createMovement, updateMovement, deleteMovement } from '#/server/movements.js'

const movementSchema = z.object({
  id: z.string(),
  description: z.string(),
  date: z.string(),
  amount_cents: z.coerce.number(),
  category_id: z.string().nullable(),
  sort_position: z.coerce.number(),
  source: z.string().default('manual'),
  created_at: z.string(),
  updated_at: z.string(),
})

export type Movement = z.infer<typeof movementSchema>

export const movementsCollection = createCollection(
  electricCollectionOptions({
    id: 'movements',
    shapeOptions: {
      url: typeof window !== 'undefined' ? `${window.location.origin}/api/electric/movements` : '/api/electric/movements',
    },
    getKey: (item: Movement) => item.id,
    schema: movementSchema,
    onInsert: async ({ transaction }) => {
      const item = transaction.mutations[0].modified
      await createMovement({
        data: {
          description: item.description,
          date: item.date,
          amount_cents: item.amount_cents,
          category_id: item.category_id,
        },
      })
    },
    onUpdate: async ({ transaction }) => {
      const { original, changes } = transaction.mutations[0]
      await updateMovement({
        data: {
          id: original.id,
          ...changes,
        },
      })
    },
    onDelete: async ({ transaction }) => {
      const { original } = transaction.mutations[0]
      await deleteMovement({ data: { id: original.id } })
    },
  }),
)
