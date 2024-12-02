import { z } from 'zod';

export const updateTopIssueSchema = z.object({
  name: z.string().optional(),
  icon: z.string().nullable().optional(),
  positionIds: z.array(z.number()).optional(),
  campaignIds: z.array(z.number()).optional(),
})

export const createTopIssueSchema = z.object({
  name: z.string(),
})

export type CreateTopIssue = z.infer<typeof createTopIssueSchema>;
export type UpdateTopIssue = z.infer<typeof updateTopIssueSchema>;