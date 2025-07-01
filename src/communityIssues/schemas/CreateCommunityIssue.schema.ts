import { Channel, Status } from '@prisma/client'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class CreateCommunityIssueSchema extends createZodDto(
  z.object({
    title: z.string().min(1, 'Title is required'),
    description: z.string().min(1, 'Description is required'),
    status: z.nativeEnum(Status).default(Status.inReview),
    channel: z.nativeEnum(Channel),
  }),
) {}
