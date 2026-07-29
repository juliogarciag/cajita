import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'
import { z } from 'zod'
import { electricShapeUrl } from '#/lib/electric-url'
import { DEFAULT_WEALTH_KIND, isWealthKind, type WealthKind } from '#/lib/wealth-kinds'

const wealthSourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  /**
   * Optional for the same reason as the category columns: a shape Electric
   * cached before migration 008 serves rows without the key. Read it through
   * `sourceKind()` rather than directly, so the fallback lives in one place.
   */
  kind: z.string().optional(),
  sort_order: z.coerce.number(),
  archived: z.coerce.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
})

export type WealthSource = z.infer<typeof wealthSourceSchema>

/** A source's kind, defaulting to cash for rows that predate migration 008. */
export function sourceKind(source: Pick<WealthSource, 'kind'>): WealthKind {
  const k = source.kind
  return k && isWealthKind(k) ? k : DEFAULT_WEALTH_KIND
}

// Read-only collection — sources are managed via server functions
export const wealthSourcesCollection = createCollection(
  electricCollectionOptions({
    id: 'wealth_sources',
    shapeOptions: {
      url: electricShapeUrl('wealth_sources'),
    },
    getKey: (item: WealthSource) => item.id,
    schema: wealthSourceSchema,
  }),
)
