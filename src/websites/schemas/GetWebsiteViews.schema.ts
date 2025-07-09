import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class GetWebsiteViewsSchema extends createZodDto(
  z
    .object({
      startDate: z.coerce.date().optional(),
      endDate: z.coerce.date().optional(),
    })
    .refine(
      (data) => {
        if (data.startDate && data.endDate) {
          return data.endDate > data.startDate
        }
        return true // Allow if either date is missing
      },
      {
        message: 'endDate must be after startDate',
        path: ['endDate'], // Shows error on endDate field
      },
    ),
) {}
