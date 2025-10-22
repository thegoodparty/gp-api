import {
  Controller,
  Get,
  Logger,
  Param,
  Query,
  Res,
  UsePipes,
} from '@nestjs/common'
import { Campaign, PathToVictory } from '@prisma/client'
import { FastifyReply } from 'fastify'
import { ZodValidationPipe } from 'nestjs-zod'
import { ReqCampaign } from 'src/campaigns/decorators/ReqCampaign.decorator'
import { UseCampaign } from 'src/campaigns/decorators/UseCampaign.decorator'
import {
  DownloadContactsDTO,
  ListContactsDTO,
} from './schemas/listContacts.schema'
import { SampleContactsDTO } from './schemas/sampleContacts.schema'
import { SearchContactsDTO } from './schemas/searchContacts.schema'
import { ContactsService } from './services/contacts.service'

type CampaignWithPathToVictory = Campaign & {
  pathToVictory?: PathToVictory | null
}

@Controller('contacts')
@UseCampaign()
@UsePipes(ZodValidationPipe)
export class ContactsController {
  private readonly logger = new Logger(ContactsController.name)
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  listContacts(
    @Query() filterDto: ListContactsDTO,
    @ReqCampaign() campaign: CampaignWithPathToVictory,
  ) {
    this.logger.debug('SWAIN CONTACTS', { test: 'something' }, 'List param two')

    return this.contactsService.findContacts(filterDto, campaign)
  }

  @Get('download')
  async downloadContacts(
    @Query() dto: DownloadContactsDTO,
    @ReqCampaign() campaign: CampaignWithPathToVictory,
    @Res() res: FastifyReply,
  ) {
    res.header('Content-Type', 'text/csv')
    res.header('Content-Disposition', 'attachment; filename="contacts.csv"')
    await this.contactsService.downloadContacts(dto, campaign, res)
  }

  @Get('stats')
  getContactsStats(@ReqCampaign() campaign: CampaignWithPathToVictory) {
    return this.contactsService.getDistrictStats(campaign)
  }

  @Get('search')
  searchContacts(
    @Query() dto: SearchContactsDTO,
    @ReqCampaign() campaign: CampaignWithPathToVictory,
  ) {
    return this.contactsService.searchContacts(dto, campaign)
  }

  @Get('sample')
  sampleContacts(
    @Query() dto: SampleContactsDTO,
    @ReqCampaign() campaign: CampaignWithPathToVictory,
  ) {
    return this.contactsService.sampleContacts(dto, campaign)
  }

  @Get(':id')
  getContact(@Param('id') id: string) {
    return this.contactsService.findPerson(id)
  }
}
