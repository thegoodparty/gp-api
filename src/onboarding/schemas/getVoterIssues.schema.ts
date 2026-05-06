import { z } from 'zod'

export const voterIssueSchema = z.object({
  label: z.string(),
  score: z.number().min(0).max(100),
  priority: z.enum(['high', 'medium', 'low']),
})

export const voterIssuesResponseSchema = z.object({
  issues: z.array(voterIssueSchema),
})

export type VoterIssueOutput = z.infer<typeof voterIssueSchema>
export type VoterIssuesResponse = z.infer<typeof voterIssuesResponseSchema>
