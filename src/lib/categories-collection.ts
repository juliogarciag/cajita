import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'
import { z } from 'zod'

const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  budget_id: z.string().nullable(),
  sort_order: z.coerce.number(),
  created_at: z.string(),
})

export type Category = z.infer<typeof categorySchema>

export const categoriesCollection = createCollection(
  electricCollectionOptions({
    id: 'categories',
    shapeOptions: {
      url: typeof window !== 'undefined' ? `${window.location.origin}/api/electric/categories` : '/api/electric/categories',
    },
    getKey: (item: Category) => item.id,
    schema: categorySchema,
  }),
)
