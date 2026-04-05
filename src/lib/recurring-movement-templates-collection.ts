import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'
import { z } from 'zod'

const recurringMovementTemplateSchema = z.object({
  id: z.string(),
  team_id: z.string(),
  description: z.string(),
  amount_cents: z.coerce.number(),
  category_id: z.string().nullable(),
  period_type: z.string(), // 'monthly' | 'annual'
  day_of_month: z.coerce.number(),
  month_of_year: z.coerce.number().nullable(),
  start_date: z.string(),
  end_date: z.string().nullable(),
  active: z.coerce.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
})

export type RecurringMovementTemplate = z.infer<typeof recurringMovementTemplateSchema>

// Read-only collection — templates are managed via server functions
export const recurringMovementTemplatesCollection = createCollection(
  electricCollectionOptions({
    id: 'recurring_movement_templates',
    shapeOptions: {
      url:
        typeof window !== 'undefined'
          ? `${window.location.origin}/api/electric/recurring_movement_templates`
          : '/api/electric/recurring_movement_templates',
    },
    getKey: (item: RecurringMovementTemplate) => item.id,
    schema: recurringMovementTemplateSchema,
  }),
)
