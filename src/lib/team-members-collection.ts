import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'
import { z } from 'zod'
import { electricShapeUrl } from '#/lib/electric-url'

const teamMemberSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
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
