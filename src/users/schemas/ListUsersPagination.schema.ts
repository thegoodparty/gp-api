import { ListUsersPaginationSchema as BaseListUsersPaginationSchema } from '@goodparty_org/contracts'
import { createZodDto } from 'nestjs-zod'

export class ListUsersPaginationSchema extends createZodDto(
  BaseListUsersPaginationSchema,
) {}
