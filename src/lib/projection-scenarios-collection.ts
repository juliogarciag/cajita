import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'
import { z } from 'zod'

const projectionScenarioSchema = z.object({
  id: z.string(),
  team_id: z.string(),
  name: z.string(),
  script_id: z.string(),
  // ElectricSQL delivers jsonb columns as already-parsed JS objects (not strings).
  // TanStack DB does not apply Zod transforms at runtime, so we use z.unknown()
  // and handle both string/object at the usage sites via parseInputsJson().
  inputs_json: z.unknown(),
  active: z.coerce.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
})

export type ProjectionScenario = z.infer<typeof projectionScenarioSchema>

export const projectionScenariosCollection = createCollection(
  electricCollectionOptions({
    id: 'projection_scenarios',
    shapeOptions: {
      url:
        typeof window !== 'undefined'
          ? `${window.location.origin}/api/electric/projection_scenarios`
          : '/api/electric/projection_scenarios',
    },
    getKey: (item: ProjectionScenario) => item.id,
    schema: projectionScenarioSchema,
  }),
)
