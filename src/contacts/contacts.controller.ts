import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UsePipes,
} from '@nestjs/common'
import { Campaign, PathToVictory, User } from '@prisma/client'
import { ReqUser } from 'src/authentication/decorators/ReqUser.decorator'
import { ReqCampaign } from 'src/campaigns/decorators/ReqCampaign.decorator'
import { FastifyReply } from 'fastify'
import { ZodValidationPipe } from 'nestjs-zod'
import { UseCampaign } from 'src/campaigns/decorators/UseCampaign.decorator'
import {
  DownloadContactsDTO,
  ListContactsDTO,
} from './schemas/listContacts.schema'
import { SampleContactsDTO } from './schemas/sampleContacts.schema'
import { SearchContactsDTO } from './schemas/searchContacts.schema'
import { ContactsService } from './services/contacts.service'
import type { TevynApiDto } from './schemas/tevynApi.schema'

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

  @Post('tevyn-api')
  sendTevynSlack(
    @ReqUser() user: User,
    @ReqCampaign() campaign: CampaignWithPathToVictory,
    @Body() { message, csvFileUrl, imageUrl, createPoll }: TevynApiDto,
  ) {
    const userInfo = {
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      email: user.email,
      phone: user.phone || undefined,
    }

    return this.contactsService.sendTevynApiMessage(
      message,
      userInfo,
      campaign,
      createPoll,
      csvFileUrl || undefined,
      imageUrl || undefined,
    )
  }
}
