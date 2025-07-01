import { IssueChannel, IssueStatus } from '@prisma/client'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class CreateCommunityIssueSchema extends createZodDto(
  z.object({
    title: z.string().min(1, 'Title is required'),
    description: z.string().min(1, 'Description is required'),
    status: z.nativeEnum(IssueStatus).default(IssueStatus.newIssue),
    channel: z.nativeEnum(IssueChannel),
    attachments: z.array(z.string().url('Must be a valid URL')).optional(),
  }),
) {}
