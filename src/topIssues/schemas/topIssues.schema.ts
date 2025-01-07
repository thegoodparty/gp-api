import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export const TopIssueSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    icon: z.string().nullable(),
  })
  .strict()

export const UpdateTopIssueSchema = TopIssueSchema
export const CreateTopIssueSchema = TopIssueSchema.omit({ id: true })
export const CreateTopIssueOutputSchema = TopIssueSchema

export class UpdateTopIssueDto extends createZodDto(UpdateTopIssueSchema) {}
export class CreateTopIssueDto extends createZodDto(CreateTopIssueSchema) {}
export class TopIssueOutputDto extends createZodDto(
  CreateTopIssueOutputSchema,
) {}
