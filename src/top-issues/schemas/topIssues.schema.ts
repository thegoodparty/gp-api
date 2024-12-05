import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class UpdateTopIssueSchema extends createZodDto(
  z.object({
    id: z.number(),
    name: z.string(),
    icon: z.string().nullable(),
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