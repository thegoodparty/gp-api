import { Prisma } from '@prisma/client'
import { createZodDto } from 'nestjs-zod'
import { PaginationSchema } from 'src/shared/schemas/Pagination.schema'

const FIELDS = Prisma.WebsiteContactScalarFieldEnum

export class GetWebsiteContactsSchema extends createZodDto(
  PaginationSchema([
    FIELDS.createdAt,
    FIELDS.updatedAt,
    FIELDS.name,
    FIELDS.email,
    FIELDS.phone,
    FIELDS.smsConsent,
  ]),
) {}
