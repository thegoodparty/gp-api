import { IssueStatus } from '../../generated/prisma'
import { createZodDto } from 'nestjs-zod'
import { CommunityIssueSchema } from './CommunityIssue.schema'

export class CreateCommunityIssueSchema extends createZodDto(
  CommunityIssueSchema.extend({
    status: CommunityIssueSchema.shape.status.default(IssueStatus.newIssue),
  }),
) {}
