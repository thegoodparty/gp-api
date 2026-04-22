import { createZodDto } from 'nestjs-zod'
import z from 'zod'

export const EXPERIMENT_IDS = [
  'voter_targeting',
  'walking_plan',
  'district_intel',
  'peer_city_benchmarking',
  'meeting_briefing',
] as const

const experimentIdSchema = z.enum(EXPERIMENT_IDS)

const dispatchExperimentSchema = z.object({
  experimentId: experimentIdSchema,
  organizationSlug: z.string().min(1),
  params: z.record(z.unknown()).default({}),
})

export class DispatchExperimentDto extends createZodDto(
  dispatchExperimentSchema,
) {}

const requestExperimentSchema = z.object({
  experimentId: experimentIdSchema,
  params: z.record(z.unknown()).default({}),
})

export class RequestExperimentDto extends createZodDto(
  requestExperimentSchema,
) {}
