import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  UsePipes,
} from '@nestjs/common'
import { ElectedOfficeService } from './services/electedOffice.service'
import { ZodValidationPipe } from 'nestjs-zod'
import { ReqUser } from 'src/authentication/decorators/ReqUser.decorator'
import { User } from '@prisma/client'
import { Prisma } from '@prisma/client'
import { toDateOnlyString } from 'src/shared/util/date.util'
import {
  CreateElectedOfficeDto,
  UpdateElectedOfficeDto,
} from './schemas/electedOffice.schema'
import { M2MOnly } from '@/authentication/guards/M2MOnly.guard'
import { UserOrM2MGuard } from './guards/UserOrM2M.guard'
import { ListElectedOfficePaginationSchema } from './schemas/ListElectedOfficePagination.schema'
import { IncomingRequest } from '@/authentication/authentication.types'

@Controller('elected-office')
@UsePipes(ZodValidationPipe)
export class ElectedOfficeController {
  constructor(private readonly electedOfficeService: ElectedOfficeService) {}

  private toApi(record: Prisma.ElectedOfficeGetPayload<object>) {
    return {
      id: record.id,
      electedDate: toDateOnlyString(record.electedDate),
      swornInDate: toDateOnlyString(record.swornInDate),
      termStartDate: toDateOnlyString(record.termStartDate),
      termEndDate: toDateOnlyString(record.termEndDate),
    }
  }

  @UseGuards(M2MOnly)
  @Get('list')
  async list(@Query() query: ListElectedOfficePaginationSchema) {
    return this.electedOfficeService.listElectedOffices(query)
  }

  @Get('current')
  async getCurrent(@ReqUser() user: User) {
    const record = await this.electedOfficeService.getCurrentElectedOffice(
      user.id,
    )
    if (!record) {
      throw new NotFoundException('No active elected office found')
    }
    return this.toApi(record)
  }

  @UseGuards(UserOrM2MGuard)
  @Get(':id')
  async getOne(@Param('id') id: string, @Req() req: IncomingRequest) {
    const record = await this.electedOfficeService.findUnique({ where: { id } })
    if (!record) {
      throw new NotFoundException('Elected office not found')
    }
    if (!req.m2mToken && record.userId !== req.user?.id) {
      throw new ForbiddenException('Not allowed to access this elected office')
    }
    return req.m2mToken ? record : this.toApi(record)
  }

  @Post('/')
  async create(@ReqUser() user: User, @Body() body: CreateElectedOfficeDto) {
    // Do this without guard to hopefully slowly move away from the hard link to campaign
    const campaign = await this.electedOfficeService.client.campaign.findFirst({
      where: { userId: user.id },
      select: { id: true },
    })
    if (!campaign) {
      throw new ForbiddenException('Not allowed to link campaign')
    }

    const created = await this.electedOfficeService.create({
      ...body,
      userId: user.id,
      campaignId: campaign.id,
    })
    return this.toApi(created)
  }

  @UseGuards(UserOrM2MGuard)
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateElectedOfficeDto,
    @Req() req: IncomingRequest,
  ) {
    const existing = await this.electedOfficeService.findUnique({
      where: { id },
    })
    if (!existing) {
      throw new NotFoundException('Elected office not found')
    }
    if (!req.m2mToken && existing.userId !== req.user?.id) {
      throw new ForbiddenException('Not allowed to access this elected office')
    }
    const data: Prisma.ElectedOfficeUpdateInput = {
      electedDate: body.electedDate,
      swornInDate: body.swornInDate,
      termStartDate: body.termStartDate,
      termEndDate: body.termEndDate,
      termLengthDays: body.termLengthDays,
      isActive: body.isActive,
    }
    const updated = await this.electedOfficeService.update({
      where: { id },
      data,
    })
    return req.m2mToken ? updated : this.toApi(updated)
  }
}
