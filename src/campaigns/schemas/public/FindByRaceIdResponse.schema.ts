import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const DomainSchema = z.object({
  name: z.string(),
  status: z.string(),
})

const WebsiteSchema = z.object({
  id: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
  campaignId: z.number(),
  status: z.string(),
  vanityPath: z.string(),
  content: z.record(z.string(), z.any()).nullable(),
  domain: DomainSchema.nullable(),
})

const PositionSchema = z.object({
  name: z.string(),
})

const TopIssueSchema = z.object({
  name: z.string(),
})

const CampaignPositionSchema = z.object({
  description: z.string().nullable(),
  position: PositionSchema,
  topIssue: TopIssueSchema.nullable(),
})

const CampaignSchema = z.object({
  id: z.number(),
  slug: z.string(),
  details: z.record(z.string(), z.any()).nullable(),
  updatedAt: z.date(),
  website: WebsiteSchema.nullable(),
  campaignPositions: z.array(CampaignPositionSchema),
})

export class FindByRaceIdResponseDto extends createZodDto(CampaignSchema) {}

export type FindByRaceIdResponse = z.infer<typeof CampaignSchema> | null
