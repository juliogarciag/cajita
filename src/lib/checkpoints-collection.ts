import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'
import { z } from 'zod'
import { electricShapeUrl } from '#/lib/electric-url'

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
      url: electricShapeUrl('checkpoints'),
    },
    getKey: (item: Checkpoint) => item.id,
    schema: checkpointSchema,
  }),
)
