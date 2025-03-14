import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export const TopIssueSchema = z
  .object({
    id: z.number(),
    name: z.string(),
  })
  .strict()

export const CreateTopIssueSchema = TopIssueSchema.omit({ id: true })
export const CreateTopIssueOutputSchema = TopIssueSchema

export class CreateTopIssueDto extends createZodDto(CreateTopIssueSchema) {}
export class TopIssueOutputDto extends createZodDto(
  CreateTopIssueOutputSchema,
) {}
