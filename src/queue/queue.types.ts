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

export type PollResponseCSV = {
  atomic_id: string
  phone_number: string
  original_message: string
  atomic_message: string
  poll_id: string
  round: string
  age: string
  location: string
  ward: string
  gender: string
  voting_performance: string
  homeowner: string
  income: string
  education: string
  k2_cluster_id: string
  k2_theme: string
  k2_category: string
  k2_summary: string
  k2_sentiment: string
}

/** Poll response row after parsing CSV and converting keys to camelCase (all values are strings) */
export type PollResponse = {
  atomicId: string
  phoneNumber: string
  originalMessage: string
  atomicMessage: string
  pollId: string
  round: string
  age: string
  location: string
  ward: string
  gender: string
  votingPerformance: string
  homeowner: string
  income: string
  education: string
  k2ClusterId: string
  k2Theme: string
  k2Category: string
  k2Summary: string
  k2Sentiment: string
}

export const OPT_OUT_THEME = 'Opt Out Request' as const
