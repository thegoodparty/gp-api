import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import { M2MOnly } from '@/authentication/guards/M2MOnly.guard'
import { ResponseSchema } from '@/shared/decorators/ResponseSchema.decorator'
import { PaginatedResponseSchema } from '@/shared/schemas/PaginatedResponse.schema'
import { AdminBriefingsService } from './services/adminBriefings.service'
import {
  AdminBriefingListQueryDto,
  BriefingAdminRowSchema,
} from './schemas/adminBriefings.schema'

@Controller('admin/briefings')
@UsePipes(ZodValidationPipe)
export class AdminBriefingsController {
  constructor(private readonly briefings: AdminBriefingsService) {}

  @Get()
  @UseGuards(M2MOnly)
  @ResponseSchema(PaginatedResponseSchema(BriefingAdminRowSchema))
  list(@Query() query: AdminBriefingListQueryDto) {
    return this.briefings.list(query)
  }

  @Get(':id')
  @UseGuards(M2MOnly)
  @ResponseSchema(BriefingAdminRowSchema)
  get(@Param('id') id: string) {
    return this.briefings.get(id)
  }
}
