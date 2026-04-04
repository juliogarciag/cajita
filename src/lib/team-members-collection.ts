import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'
import { z } from 'zod'

const teamMemberSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
})

export type TeamMember = z.infer<typeof teamMemberSchema>

export const teamMembersCollection = createCollection(
  electricCollectionOptions({
    id: 'team_members',
    shapeOptions: {
      url:
        typeof window !== 'undefined'
          ? `${window.location.origin}/api/electric/team_members`
          : '/api/electric/team_members',
    },
    getKey: (item: TeamMember) => item.id,
    schema: teamMemberSchema,
  }),
)
