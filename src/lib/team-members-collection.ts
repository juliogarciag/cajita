import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'
import { z } from 'zod'
import { electricShapeUrl } from '#/lib/electric-url'

const teamMemberSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  /**
   * Local override of the Google name; see migration 005. Optional rather than
   * merely nullable: a shape Electric cached before the column existed serves
   * rows without the key at all, and a required key would fail validation and
   * take note attribution down until Electric was restarted.
   */
  display_name: z.string().nullable().optional(),
})

export type TeamMember = z.infer<typeof teamMemberSchema>

export const teamMembersCollection = createCollection(
  electricCollectionOptions({
    id: 'team_members',
    shapeOptions: {
      url: electricShapeUrl('team_members'),
    },
    getKey: (item: TeamMember) => item.id,
    schema: teamMemberSchema,
  }),
)
