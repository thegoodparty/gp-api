import { Controller, Get, Param, Query, Res, UsePipes } from '@nestjs/common'
import { Campaign, Organization } from '@prisma/client'
import { FastifyReply } from 'fastify'
import { ZodValidationPipe } from 'nestjs-zod'
import { ReqCampaign } from 'src/campaigns/decorators/ReqCampaign.decorator'
import { UseCampaign } from 'src/campaigns/decorators/UseCampaign.decorator'
import { ReqOrganization } from 'src/organizations/decorators/ReqOrganization.decorator'
import { UseOrganization } from 'src/organizations/decorators/UseOrganization.decorator'
import { GetPersonParamsDTO } from './schemas/getPerson.schema'
import {
  DownloadContactsDTO,
  ListContactsDTO,
} from './schemas/listContacts.schema'
import { ContactsService } from './services/contacts.service'

@Controller('contacts')
@UseCampaign({ continueIfNotFound: true })
@UseOrganization()
@UsePipes(ZodValidationPipe)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  async listContacts(
    @Query() filterDto: ListContactsDTO,
    @ReqCampaign() campaign: Campaign | undefined,
    @ReqOrganization() organization: Organization,
  ) {
    return this.contactsService.findContacts(filterDto, campaign, organization)
  }

  @Get('download')
  async downloadContacts(
    @Query() dto: DownloadContactsDTO,
    @ReqCampaign() campaign: Campaign | undefined,
    @ReqOrganization() organization: Organization,
    @Res() res: FastifyReply,
  ) {
    res.header('Content-Type', 'text/csv')
    res.header('Content-Disposition', 'attachment; filename="contacts.csv"')
    await this.contactsService.downloadContacts(
      dto,
      campaign,
      res,
      organization,
    )
  }

  @Get('stats')
  getContactsStats(
    @ReqCampaign() campaign: Campaign | undefined,
    @ReqOrganization() organization: Organization,
  ) {
    return this.contactsService.getDistrictStats(campaign, organization)
  }

  @Get(':id')
  async getContact(
    @Param() params: GetPersonParamsDTO,
    @ReqCampaign() campaign: Campaign | undefined,
    @ReqOrganization() organization: Organization,
  ) {
    return this.contactsService.findPerson(params.id, campaign, organization)
  }
}
