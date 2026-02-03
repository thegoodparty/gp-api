import { ReqUser } from '@/authentication/decorators/ReqUser.decorator'
import { ElectedOfficeService } from '@/electedOffice/services/electedOffice.service'
import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Res,
  UsePipes,
} from '@nestjs/common'
import { Campaign, PathToVictory, User } from '@prisma/client'
import { FastifyReply } from 'fastify'
import { ZodValidationPipe } from 'nestjs-zod'
import { ReqCampaign } from 'src/campaigns/decorators/ReqCampaign.decorator'
import { UseCampaign } from 'src/campaigns/decorators/UseCampaign.decorator'
import {
  ConstituentActivityEventType,
  ConstituentActivityType,
  GetIndividualActivitiesResponse,
} from './contacts.types'
import { GetPersonParamsDTO } from './schemas/getPerson.schema'
import {
  IndividualActivityParamsDTO,
  IndividualActivityQueryDTO,
} from './schemas/individualActivity.schema'
import {
  DownloadContactsDTO,
  ListContactsDTO,
} from './schemas/listContacts.schema'
import { ContactsService } from './services/contacts.service'

type CampaignWithPathToVictory = Campaign & {
  pathToVictory?: PathToVictory | null
}

@Controller('contacts')
@UseCampaign()
@UsePipes(ZodValidationPipe)
export class ContactsController {
  constructor(
    private readonly contactsService: ContactsService,
    private readonly electedOfficeService: ElectedOfficeService,
  ) {}

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

  @Get(':id')
  getContact(
    @Param() params: GetPersonParamsDTO,
    @ReqCampaign() campaign: CampaignWithPathToVictory,
  ) {
    return this.contactsService.findPerson(params.id, campaign)
  }

  @Get('/:id/activities')
  async getIndividualActivities(
    @Param() params: IndividualActivityParamsDTO,
    @Query() query: IndividualActivityQueryDTO,
    @ReqUser() user: User,
  ): Promise<GetIndividualActivitiesResponse> {
    const existing = await this.electedOfficeService.getCurrentElectedOffice(
      user.id,
    )
    if (!existing) {
      throw new NotFoundException(
        'No electedOffice found associated with that userId',
      )
    }
    // return getIndividualActivities(...params, ...query)
    // Dummy response for scaffolding
    return {
      nextCursor: 'last-seen-id',
      results: [
        {
          type: ConstituentActivityType.POLL_INTERACTIONS,
          date: 'myDate',
          data: {
            pollId: 'poll-id',
            pollTitle: 'poll-title',
            events: [
              {
                type: ConstituentActivityEventType.SENT,
                date: 'myDate',
              },
            ],
          },
        },
      ],
    }
  }
}
