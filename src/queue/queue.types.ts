import { TcrCompliance } from '@prisma/client'
import type { PathToVictoryInput } from 'src/pathToVictory/types/pathToVictory.types'
import z from 'zod'

export enum QueueType {
  GENERATE_AI_CONTENT = 'generateAiContent',
  PATH_TO_VICTORY = 'pathToVictory',
  TCR_COMPLIANCE_STATUS_CHECK = 'tcrComplianceStatusCheck',
  GENERATE_TASKS = 'generateTasks',
  DOMAIN_EMAIL_FORWARDING = 'domainEmailForwarding',
  POLL_ANALYSIS_COMPLETE = 'pollAnalysisComplete',
  POLL_CREATION = 'pollCreation',
  POLL_EXPANSION = 'pollExpansion',
  AGENT_EXPERIMENT_RESULT = 'agentExperimentResult',
}

export type QueueMessage =
  | { type: QueueType.GENERATE_AI_CONTENT; data: GenerateAiContentMessageData }
  | { type: QueueType.PATH_TO_VICTORY; data: PathToVictoryInput }
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
  | { type: QueueType.GENERATE_TASKS; data: GenerateTasksMessage }
  | {
      type: QueueType.AGENT_EXPERIMENT_RESULT
      data: AgentExperimentResultData
    }

export type GenerateAiContentMessageData = {
  slug: string
  key: string
  regenerate: boolean
}

export type TcrComplianceStatusCheckMessage = {
  tcrCompliance: TcrCompliance
}

export type GenerateTasksMessage = {
  campaignId: number
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

export const AgentExperimentResultSchema = z.object({
  experimentId: z.string(),
  runId: z.string(),
  candidateId: z.string(),
  status: z.enum(['success', 'failed', 'contract_violation']),
  artifactKey: z.string().optional(),
  artifactBucket: z.string().optional(),
  durationSeconds: z.number().optional(),
  error: z.string().optional(),
})

export type AgentExperimentResultData = z.infer<
  typeof AgentExperimentResultSchema
>
