import { TcrCompliance } from '@prisma/client'
import z from 'zod'

export enum QueueType {
  GENERATE_AI_CONTENT = 'generateAiContent',
  TCR_COMPLIANCE_STATUS_CHECK = 'tcrComplianceStatusCheck',
  DOMAIN_EMAIL_FORWARDING = 'domainEmailForwarding',
  POLL_ANALYSIS_COMPLETE = 'pollAnalysisComplete',
  POLL_CREATION = 'pollCreation',
  POLL_EXPANSION = 'pollExpansion',
  CAMPAIGN_PLAN_COMPLETE = 'campaignPlanComplete',
}

export type QueueMessage =
  | { type: QueueType.GENERATE_AI_CONTENT; data: GenerateAiContentMessageData }
  | {
      type: QueueType.TCR_COMPLIANCE_STATUS_CHECK
      data: TcrComplianceStatusCheckMessage
    }
  | {
      type: QueueType.DOMAIN_EMAIL_FORWARDING
      data: DomainEmailForwardingMessage
    }
  | {
      type: QueueType.POLL_ANALYSIS_COMPLETE
      data: PollAnalysisCompleteEvent['data']
    }
  | { type: QueueType.POLL_CREATION; data: PollCreationEvent['data'] }
  | { type: QueueType.POLL_EXPANSION; data: PollExpansionEvent['data'] }
  | {
      type: QueueType.CAMPAIGN_PLAN_COMPLETE
      data: CampaignPlanCompleteMessage
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

export const CampaignPlanCompleteMessageSchema = z.discriminatedUnion(
  'status',
  [
    z.object({
      campaignId: z.number(),
      status: z.literal('completed'),
      s3Key: z.string(),
      taskCount: z.number().optional(),
      generationTimestamp: z.string().optional(),
    }),
    z.object({
      campaignId: z.number(),
      status: z.literal('error'),
      error: z.string().optional(),
    }),
  ],
)

export type CampaignPlanCompleteMessage = z.infer<
  typeof CampaignPlanCompleteMessageSchema
>

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

const PollResponseJsonRowSchema = z.object({
  atomicId: z.string(),
  phoneNumber: z.string(),
  receivedAt: z.string(),
  originalMessage: z.string(),
  atomicMessage: z.string(),
  pollId: z.string(),
  clusterId: z.union([z.number(), z.string()]), // Empty string for opt-out rows
  theme: z.string(),
  category: z.string(),
  summary: z.string(),
  sentiment: z.string(),
  isOptOut: z.boolean(),
})

export type PollResponseJsonRow = z.infer<typeof PollResponseJsonRowSchema>

export const PollClusterAnalysisJsonSchema = z.array(PollResponseJsonRowSchema)
export type PollClusterAnalysisJson = z.infer<
  typeof PollClusterAnalysisJsonSchema
>
