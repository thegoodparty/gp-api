import { z } from 'zod'
import { ExperimentRunStatusSchema } from '../generated/enums'
import { PaginationOptionsSchema } from '../shared/Pagination.schema'

// Candidate identity surfaced on a run, read from the run's params JSON.
// Only compliance_setup params carry it; null for every other experiment type.
export const AgentRunCandidateSummarySchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  campaignId: z.number().nullable(),
})

export type AgentRunCandidateSummary = z.infer<
  typeof AgentRunCandidateSummarySchema
>

export const AgentRunListItemSchema = z.object({
  runId: z.string(),
  experimentType: z.string(),
  status: ExperimentRunStatusSchema,
  organizationSlug: z.string(),
  candidate: AgentRunCandidateSummarySchema.nullable(),
  durationSeconds: z.number().nullable(),
  costUsd: z.number().nullable(),
  createdAt: z.coerce.date(),
})

export type AgentRunListItem = z.infer<typeof AgentRunListItemSchema>

export const AgentRunsListQuerySchema = PaginationOptionsSchema.extend({
  experimentType: z.string().optional(),
  status: ExperimentRunStatusSchema.optional(),
  organizationSlug: z.string().optional(),
  createdAfter: z.coerce.date().optional(),
  createdBefore: z.coerce.date().optional(),
})

export type AgentRunsListQuery = z.infer<typeof AgentRunsListQuerySchema>

// The full experiment_run row. The artifact + conversation log are read from
// S3 in the detail endpoint, never persisted as columns.
export const AgentRunSchema = z.object({
  runId: z.string(),
  organizationSlug: z.string(),
  experimentType: z.string(),
  status: ExperimentRunStatusSchema,
  params: z.record(z.string(), z.unknown()),
  artifactBucket: z.string().nullable(),
  artifactKey: z.string().nullable(),
  durationSeconds: z.number().nullable(),
  costUsd: z.number().nullable(),
  error: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export type AgentRun = z.infer<typeof AgentRunSchema>

// The artifact is opaque to gp-api (ComplianceSetupOutput is `{[k]: unknown}`);
// gp-admin interprets the known fields. null while the run is still RUNNING.
export const AgentRunDetailSchema = z.object({
  run: AgentRunSchema,
  artifact: z.record(z.string(), z.unknown()).nullable(),
  conversationLog: z.string().nullable(),
})

export type AgentRunDetail = z.infer<typeof AgentRunDetailSchema>
