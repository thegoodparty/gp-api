import { Prisma } from '@prisma/client'
import { createZodDto } from 'nestjs-zod'
import { SortablePaginationSchema } from 'src/shared/schemas/Pagination.schema'

const FIELDS = Prisma.WebsiteContactScalarFieldEnum

export class GetWebsiteContactsSchema extends createZodDto(
  SortablePaginationSchema([
    FIELDS.createdAt,
    FIELDS.updatedAt,
    FIELDS.name,
    FIELDS.email,
    FIELDS.phone,
    FIELDS.smsConsent,
  ]),
) {}
