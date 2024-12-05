import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const UpdateTopIssueSchema = z.object({
  id: z.number(),
  name: z.string(),
  icon: z.string().nullable(),
})
.strict()
export class UpdateTopIssueDto extends createZodDto(UpdateTopIssueSchema) {};


export const CreateTopIssueSchema = z.object({ 
  name: z.string(), 
  icon: z.string().nullable()
}).strict()
export class CreateTopIssueDto extends createZodDto(CreateTopIssueSchema) {};

export const CreateTopIssueOutputSchema = z.object({
  id: z.number(),
  name: z.string(),
  icon: z.string().nullable(),
})
export class TopIssueOutputDto extends createZodDto(CreateTopIssueOutputSchema) {};