import {
  Body,
  Controller,
  Delete,
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
import { Campaign } from '@prisma/client'
import { ZodValidationPipe } from 'nestjs-zod'
import { ReqCampaign } from 'src/campaigns/decorators/ReqCampaign.decorator'
import { UseCampaign } from 'src/campaigns/decorators/UseCampaign.decorator'
import { CreateContactsSegmentDto } from './schemas/CreateContactsSegment.schema'
import { UpdateContactsSegmentDto } from './schemas/UpdateContactsSegment.schema'
import { ContactsSegmentService } from './services/contactsSegment.service'

@Controller('contacts-segment')
@UseCampaign()
@UsePipes(ZodValidationPipe)
export class ContactsSegmentController {
  constructor(
    private readonly contactsSegmentService: ContactsSegmentService,
  ) {}

  @Get()
  list(@ReqCampaign() campaign: Campaign) {
    return this.contactsSegmentService.findByCampaignId(campaign.id)
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @ReqCampaign() campaign: Campaign,
  ) {
    const segment = await this.contactsSegmentService.findByIdAndCampaignId(
      id,
      campaign.id,
    )
    if (!segment) {
      throw new NotFoundException('Contacts segment not found')
    }
    return segment
  }

  @Post()
  create(
    @Body() body: CreateContactsSegmentDto,
    @ReqCampaign() campaign: Campaign,
  ) {
    return this.contactsSegmentService.create(body, campaign.id)
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateContactsSegmentDto,
    @ReqCampaign() campaign: Campaign,
  ) {
    const segment = await this.contactsSegmentService.findByIdAndCampaignId(
      id,
      campaign.id,
    )
    if (!segment) {
      throw new NotFoundException('Contacts segment not found')
    }
    return this.contactsSegmentService.update(id, body, campaign.id)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id', ParseIntPipe) id: number,
    @ReqCampaign() campaign: Campaign,
  ) {
    const segment = await this.contactsSegmentService.findByIdAndCampaignId(
      id,
      campaign.id,
    )
    if (!segment) {
      throw new NotFoundException('Contacts segment not found')
    }
    await this.contactsSegmentService.delete(id, campaign.id)
  }
}
