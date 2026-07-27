import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'
import { z } from 'zod'
import { electricShapeUrl } from '#/lib/electric-url'

const colorBookmarkSchema = z.object({
  id: z.string(),
  color: z.string(),
  sort_order: z.coerce.number(),
  created_at: z.string(),
})

export type ColorBookmark = z.infer<typeof colorBookmarkSchema>

// Read-only collection — bookmarks are added/removed via server functions
export const colorBookmarksCollection = createCollection(
  electricCollectionOptions({
    id: 'color_bookmarks',
    shapeOptions: {
      url: electricShapeUrl('color_bookmarks'),
    },
    getKey: (item: ColorBookmark) => item.id,
    schema: colorBookmarkSchema,
  }),
)
