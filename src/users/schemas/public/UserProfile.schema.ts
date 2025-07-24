import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const TopIssueSchema = z.object({
  id: z.number(),
  name: z.string(),
})

const PositionSchema = z.object({
  id: z.number(),
  name: z.string(),
  topIssue: TopIssueSchema.optional(),
})

const CampaignPositionSchema = z.object({
  id: z.number(),
  description: z.string().nullable(),
  order: z.number().nullable(),
  position: PositionSchema,
  topIssue: TopIssueSchema.optional(),
})

const CampaignDetailsSchema = z.object({
  office: z.string().optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  normalizedOffice: z.string().optional(),
  campaignCommittee: z.string().optional(),
  occupation: z.string().optional(),
  party: z.string().optional(),
  website: z.string().optional(),
  pastExperience: z.union([z.string(), z.record(z.string(), z.string())]).optional(),
  funFact: z.string().optional(),
})

const CampaignSchema = z.object({
  id: z.number(),
  slug: z.string(),
  isActive: z.boolean(),
  details: CampaignDetailsSchema.optional(),
  topIssues: z.array(TopIssueSchema),
  campaignPositions: z.array(CampaignPositionSchema),
})

const UserProfileResponseSchema = z.object({
  id: z.number(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  name: z.string().nullable(),
  avatar: z.string().nullable(),
  campaigns: z.array(CampaignSchema),
})

export class UserProfileResponseDto extends createZodDto(UserProfileResponseSchema) {} 