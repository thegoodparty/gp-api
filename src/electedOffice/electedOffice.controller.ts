import { IncomingRequest } from '@/authentication/authentication.types'
import { M2MOnly } from '@/authentication/guards/M2MOnly.guard'
import { OrganizationsService } from '@/organizations/services/organizations.service'
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
import { ElectedOffice, Organization, Prisma, User } from '@prisma/client'
import { ZodValidationPipe } from 'nestjs-zod'
import { ReqUser } from 'src/authentication/decorators/ReqUser.decorator'
import { ReqOrganization } from 'src/organizations/decorators/ReqOrganization.decorator'
import { UseOrganization } from 'src/organizations/decorators/UseOrganization.decorator'
import { toDateOnlyString } from 'src/shared/util/date.util'
import { ReqElectedOffice } from './decorators/ReqElectedOffice.decorator'
import { UseElectedOffice } from './decorators/UseElectedOffice.decorator'
import { UserOrM2MGuard } from './guards/UserOrM2M.guard'
import {
  CreateElectedOfficeDto,
  SetElectedOfficeDistrictDto,
  UpdateElectedOfficeDto,
} from './schemas/electedOffice.schema'
import { ListElectedOfficePaginationSchema } from './schemas/ListElectedOfficePagination.schema'
import { ElectedOfficeService } from './services/electedOffice.service'

@Controller('elected-office')
@UsePipes(ZodValidationPipe)
export class ElectedOfficeController {
  constructor(
    private readonly electedOfficeService: ElectedOfficeService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  private toApi(record: Prisma.ElectedOfficeGetPayload<object>) {
    return {
      id: record.id,
      swornInDate: toDateOnlyString(record.swornInDate),
    }
  }

  @UseGuards(M2MOnly)
  @Get('list')
  async list(@Query() query: ListElectedOfficePaginationSchema) {
    return this.electedOfficeService.listElectedOffices(query)
  }

  @UseElectedOffice()
  @Get('current')
  async getCurrent(@ReqElectedOffice() electedOffice: ElectedOffice) {
    return this.toApi(electedOffice)
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
  @UseOrganization()
  async create(
    @ReqUser() user: User,
    @Body() body: CreateElectedOfficeDto,
    @ReqOrganization() organization: Organization,
  ) {
    const campaign = await this.electedOfficeService.client.campaign.findUnique(
      {
        where: { organizationSlug: organization.slug },
      },
    )
    if (!campaign) {
      throw new ForbiddenException('Not allowed to link campaign')
    }

    const created = await this.electedOfficeService.create({
      ...body,
      userId: user.id,
      campaignId: campaign.id,
      orgData: {
        positionId: organization.positionId,
        customPositionName: organization.customPositionName,
        overrideDistrictId: organization.overrideDistrictId,
      },
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
      swornInDate: body.swornInDate,
    }
    const updated = await this.electedOfficeService.update({
      where: { id },
      data,
    })
    return req.m2mToken ? updated : this.toApi(updated)
  }

  @UseGuards(M2MOnly)
  @Put(':id/district')
  async setDistrict(
    @Param('id') id: string,
    @Body() body: SetElectedOfficeDistrictDto,
  ) {
    const existing = await this.electedOfficeService.findUnique({
      where: { id },
    })
    if (!existing) {
      throw new NotFoundException('Elected office not found')
    }

    const orgSlug = OrganizationsService.electedOfficeOrgSlug(id)
    const org = await this.organizationsService.findUnique({
      where: { slug: orgSlug },
    })
    if (!org) {
      throw new NotFoundException(
        'Organization for this elected office not found',
      )
    }

    const overrideDistrictId =
      await this.organizationsService.resolveOverrideDistrictId({
        positionId: org.positionId ?? undefined,
        state: body.state,
        L2DistrictType: body.L2DistrictType,
        L2DistrictName: body.L2DistrictName,
      })

    await this.organizationsService.model.update({
      where: { slug: orgSlug },
      data: { overrideDistrictId },
    })

    return { electedOfficeId: id, overrideDistrictId }
  }
}
