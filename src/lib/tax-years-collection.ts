import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'
import { z } from 'zod'
import { electricShapeUrl } from '#/lib/electric-url'

const taxYearSchema = z.object({
  id: z.string(),
  year: z.coerce.number(),
  // `numeric` arrives as a string; see normalizeRate in income-tax-year.
  regularization_rate: z.union([z.string(), z.number()]).nullable(),
  uit_override: z.coerce.number().nullable(),
  regularization_paid_on: z.string().nullable(),
  regularization_paid_soles_cents: z.coerce.number().nullable(),
  regularization_paid_usd_cents: z.coerce.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})

export type TaxYearRow = z.infer<typeof taxYearSchema>

// Read-only collection — written through server functions
export const taxYearsCollection = createCollection(
  electricCollectionOptions({
    id: 'tax_years',
    shapeOptions: {
      url: electricShapeUrl('tax_years'),
    },
    getKey: (item: TaxYearRow) => item.id,
    schema: taxYearSchema,
  }),
)
