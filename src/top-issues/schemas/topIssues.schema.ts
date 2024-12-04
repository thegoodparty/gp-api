import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class UpdateTopIssueSchema extends createZodDto(
  z.object({
    name: z.string().optional(),
    icon: z.string().nullable().optional(),
    positionIds: z.array(z.number()).optional(),
    campaignIds: z.array(z.number()).optional(),
  })
  .strict()

) {}

export class CreateTopIssueSchema extends createZodDto(
  z.object({ 
    name: z.string(), 
    icon: z.string().nullable()
  }).strict(),
) {}

export class DeleteTopIssueSchema extends createZodDto(
  z.object({
    id: z.number()
  }).strict()
) {}