import { Channel, Status } from '@prisma/client'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class UpdateCommunityIssueSchema extends createZodDto(
  z.object({
    title: z.string().min(1, 'Title is required').optional(),
    description: z.string().min(1, 'Description is required').optional(),
    status: z.nativeEnum(Status).optional(),
    channel: z.nativeEnum(Channel).optional(),
  }),
) {}
