import { Prisma } from '@prisma/client'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { SortablePaginationSchema } from '@goodparty_org/contracts'

const FIELDS = Prisma.WebsiteContactScalarFieldEnum

export class GetWebsiteContactsSchema extends createZodDto(
  SortablePaginationSchema([
    FIELDS.createdAt,
    FIELDS.updatedAt,
    FIELDS.name,
    FIELDS.email,
    FIELDS.phone,
    FIELDS.smsConsent,
  ]).extend({
    page: z.coerce.number().min(1).optional(),
  }),
) {}
