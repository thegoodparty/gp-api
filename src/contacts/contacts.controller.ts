import { Controller, Get, Query, UsePipes, Res, Param } from '@nestjs/common'
import { Campaign, PathToVictory } from '@prisma/client'
import { ZodValidationPipe } from 'nestjs-zod'
import { ReqCampaign } from 'src/campaigns/decorators/ReqCampaign.decorator'
import { UseCampaign } from 'src/campaigns/decorators/UseCampaign.decorator'
import { ContactsService } from './services/contacts.service'
import {
  ListContactsDTO,
  DownloadContactsDTO,
} from './schemas/listContacts.schema'
import { FastifyReply } from 'fastify'

type CampaignWithPathToVictory = Campaign & {
  pathToVictory?: PathToVictory | null
}

@Controller('contacts')
@UseCampaign()
@UsePipes(ZodValidationPipe)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  listContacts(
    @Query() filterDto: ListContactsDTO,
    @ReqCampaign() campaign: CampaignWithPathToVictory,
  ) {
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

  @Get(':id')
  getContact(@Param('id') id: string) {
    return this.contactsService.findPerson(id)
  }
}
