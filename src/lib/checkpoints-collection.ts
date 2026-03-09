import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'
import { z } from 'zod'

const checkpointSchema = z.object({
  id: z.string(),
  movement_id: z.string(),
  expected_cents: z.coerce.number(),
  actual_cents: z.coerce.number(),
  created_at: z.string(),
})

export type Checkpoint = z.infer<typeof checkpointSchema>

// Read-only collection — checkpoints are created/deleted via server functions
export const checkpointsCollection = createCollection(
  electricCollectionOptions({
    id: 'checkpoints',
    shapeOptions: {
      url:
        typeof window !== 'undefined'
          ? `${window.location.origin}/api/electric/checkpoints`
          : '/api/electric/checkpoints',
    },
    getKey: (item: Checkpoint) => item.id,
    schema: checkpointSchema,
  }),
)
