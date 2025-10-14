import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
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
      ...record,
      electedDate: toDateOnlyString(record.electedDate),
      swornInDate: toDateOnlyString(record.swornInDate),
      termStartDate: toDateOnlyString(record.termStartDate),
      termEndDate: toDateOnlyString(record.termEndDate),
    }
  }

  @Get('/')
  async list(@ReqUser() user: User) {
    const items = await this.electedOfficeService.findMany({
      where: { userId: user.id },
      orderBy: { id: 'asc' },
    })
    return { results: items.map((i) => this.toApi(i)) }
  }

  @Get(':id')
  async getOne(@Param('id', ParseIntPipe) id: number, @ReqUser() user: User) {
    const record = await this.electedOfficeService.findUnique({ where: { id } })
    if (!record || record.userId !== user.id) {
      throw new NotFoundException('Elected office not found')
    }
    return this.toApi(record)
  }

  @Post('/')
  create(@ReqUser() user: User, @Body() body: CreateElectedOfficeDto) {
    const data: Prisma.ElectedOfficeCreateInput = {
      electedDate: body.electedDate,
      swornInDate: body.swornInDate,
      termStartDate: body.termStartDate,
      termEndDate: body.termEndDate,
      isActive: body.isActive,
      user: { connect: { id: user.id } },
      campaign: { connect: { id: body.campaignId } },
    }
    return this.electedOfficeService.create({ data })
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @ReqUser() user: User,
    @Body() body: UpdateElectedOfficeDto,
  ) {
    const existing = await this.electedOfficeService.findUnique({
      where: { id },
    })
    if (!existing || existing.userId !== user.id) {
      throw new ForbiddenException('Not allowed')
    }
    const data: Prisma.ElectedOfficeUpdateInput = {
      electedDate: body.electedDate,
      swornInDate: body.swornInDate,
      termStartDate: body.termStartDate,
      termEndDate: body.termEndDate,
      isActive: body.isActive,
    }
    return this.electedOfficeService.update({ where: { id }, data })
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number, @ReqUser() user: User) {
    const existing = await this.electedOfficeService.findUnique({
      where: { id },
    })
    if (!existing || existing.userId !== user.id) {
      throw new NotFoundException('Elected office not found')
    }
    await this.electedOfficeService.delete({ where: { id } })
  }
}
