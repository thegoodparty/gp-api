import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class CreateProjectSchema extends createZodDto(
  z
    .object({
      name: z.string().min(1),
      message: z.string().min(1),
      areaCode: z.string().min(1),
      groupId: z.string().min(1),
      flags: z.literal('outsourced'),
      outsourceStart: z.string().min(1),
      outsourceEnd: z.string().min(1),
      outsourceEmail: z.string().email(),
    })
    .strict(),
) {}
