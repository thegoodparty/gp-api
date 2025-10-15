import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
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

  @Get(':id')
  async getOne(@Param('id') id: string, @ReqUser() user: User) {
    const record = await this.electedOfficeService.findUnique({ where: { id } })
    if (!record || record.userId !== user.id) {
      throw new NotFoundException('Elected office not found')
    }
    return this.toApi(record)
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
    const data: Prisma.ElectedOfficeCreateInput = {
      electedDate: body.electedDate,
      swornInDate: body.swornInDate,
      termStartDate: body.termStartDate,
      termEndDate: body.termEndDate,
      termLengthDays: body.termLengthDays,
      isActive: body.isActive,
      user: { connect: { id: user.id } },
      campaign: { connect: { id: campaign.id } },
    }
    const created = await this.electedOfficeService.create({ data })
    return this.toApi(created)
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @ReqUser() user: User,
    @Body() body: UpdateElectedOfficeDto,
  ) {
    const existing = await this.electedOfficeService.findUnique({
      where: { id },
    })
    if (!existing || existing.userId !== user.id) {
      throw new ForbiddenException(
        'You do not have permission to update this elected office',
      )
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
    return this.toApi(updated)
  }
}
