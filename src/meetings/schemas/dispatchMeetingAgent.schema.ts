import { z } from 'zod'

export const DispatchMeetingAgentSchema = z.object({
  electedOfficeId: z.string().min(1),
  kind: z.enum(['schedule', 'briefing']),
  useImminenceGate: z.boolean().optional(),
})

export type DispatchMeetingAgentDto = z.infer<typeof DispatchMeetingAgentSchema>
