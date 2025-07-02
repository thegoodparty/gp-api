import { createZodDto } from 'nestjs-zod'
import { CommunityIssueSchema } from './CommunityIssue.schema'

export class UpdateCommunityIssueSchema extends createZodDto(
  CommunityIssueSchema.partial(),
) {}
