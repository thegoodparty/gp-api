import { IssueChannel, IssueStatus } from '@prisma/client'
import { z } from 'zod'

export const CommunityIssueSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  status: z.nativeEnum(IssueStatus),
  channel: z.nativeEnum(IssueChannel),
  attachments: z.array(z.string().url('Must be a valid URL')).optional(),
})

export type CommunityIssue = z.infer<typeof CommunityIssueSchema>
