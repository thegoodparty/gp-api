import { TcrCompliance } from '@prisma/client'
import z from 'zod'

export enum QueueType {
  GENERATE_AI_CONTENT = 'generateAiContent',
  PATH_TO_VICTORY = 'pathToVictory',
  TCR_COMPLIANCE_STATUS_CHECK = 'tcrComplianceStatusCheck',
  DOMAIN_EMAIL_FORWARDING = 'domainEmailForwarding',
  POLL_ANALYSIS_COMPLETE = 'pollAnalysisComplete',
  POLL_CREATION = 'pollCreation',
  POLL_EXPANSION = 'pollExpansion',
}

export type QueueMessage = {
  type: QueueType
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  data: unknown // any until we define the actual data structure for each message type
}

export type GenerateAiContentMessageData = {
  slug: string
  key: string
  regenerate: boolean
}

export type TcrComplianceStatusCheckMessage = {
  tcrCompliance: TcrCompliance
}

export type DomainEmailForwardingMessage = {
  domainId: number
  forwardingEmailAddress: string
}

export const PollAnalysisCompleteEventSchema = z.object({
  type: z.literal(QueueType.POLL_ANALYSIS_COMPLETE),
  data: z.object({
    pollId: z.string(),
    totalResponses: z.number(),
    responsesLocation: z.string(),
    issues: z.array(
      z.object({
        pollId: z.string(),
        rank: z.number().min(1).max(3),
        theme: z.string(),
        summary: z.string(),
        analysis: z.string(),
        responseCount: z.number(),
        quotes: z.array(
          z.object({ quote: z.string(), phone_number: z.string() }),
        ),
      }),
    ),
  }),
})
export type PollAnalysisCompleteEvent = z.infer<
  typeof PollAnalysisCompleteEventSchema
>

export const PollCreationEventSchema = z.object({
  type: z.literal(QueueType.POLL_CREATION),
  data: z.object({ pollId: z.string() }),
})
export type PollCreationEvent = z.infer<typeof PollCreationEventSchema>

export const PollExpansionEventSchema = z.object({
  type: z.literal(QueueType.POLL_EXPANSION),
  data: z.object({ pollId: z.string() }),
})
export type PollExpansionEvent = z.infer<typeof PollExpansionEventSchema>

export enum MessageGroup {
  p2v = 'p2v',
  content = 'content',
  tcrCompliance = 'tcrCompliance',
  default = 'default',
  domainEmailRedirect = 'domainEmailRedirect',
  polls = 'polls',
}

export type PollResponseJsonRow = {
  atomicId?: string
  phoneNumber: string
  receivedAt: string
  originalMessage: string
  atomicMessage?: string
  pollId?: string
  clusterId: number | string // Empty string for opt-out rows
  theme?: string
  category?: string
  summary?: string
  sentiment?: string
  isOptOut?: boolean
}

export type PollClusterAnalysisJson = PollResponseJsonRow[]
