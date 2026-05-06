import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const getVoterIssuesQuerySchema = z
  .object({
    districtId: z.string().min(1).optional(),
    ballotReadyPositionId: z.string().min(1).optional(),
    state: z.string().min(2).max(2).optional(),
    city: z.string().min(1).optional(),
  })
  .refine((v) => Boolean(v.districtId || v.ballotReadyPositionId), {
    message: 'At least one of districtId or ballotReadyPositionId is required',
  })

export class GetVoterIssuesQueryDTO extends createZodDto(
  getVoterIssuesQuerySchema,
) {}

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
