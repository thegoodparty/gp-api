import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { CreateEcanvasserDto } from './dto/create-ecanvasser.dto'
import { UpdateEcanvasserDto } from './dto/update-ecanvasser.dto'
import { CampaignsService } from '../campaigns/services/campaigns.service'
import axios from 'axios'

@Injectable()
export class EcanvasserService extends createPrismaBase(MODELS.Ecanvasser) {
  public readonly logger = new Logger(EcanvasserService.name)
  private readonly apiBaseUrl = 'https://public-api.ecanvasser.com'

  constructor(private readonly campaignsService: CampaignsService) {
    super()
  }

  async create(campaignId: number, createEcanvasserDto: CreateEcanvasserDto) {
    const campaign = await this.campaignsService.findFirstOrThrow({
      where: { id: campaignId },
    })

    return this.model.create({
      data: {
        campaignId: campaign.id,
        apiKey: createEcanvasserDto.apiKey,
      },
    })
  }

  async findByCampaignId(campaignId: number) {
    const ecanvasser = await this.model.findFirst({
      where: { campaignId },
    })

    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser integration not found')
    }

    return ecanvasser
  }

  async update(campaignId: number, updateEcanvasserDto: UpdateEcanvasserDto) {
    const ecanvasser = await this.findByCampaignId(campaignId)

    return this.model.update({
      where: { id: ecanvasser.id },
      data: updateEcanvasserDto,
    })
  }

  async remove(campaignId: number) {
    const ecanvasser = await this.findByCampaignId(campaignId)

    return this.model.delete({
      where: { id: ecanvasser.id },
    })
  }

  private async fetchFromApi<T>(endpoint: string, apiKey: string): Promise<T> {
    try {
      const response = await axios.get(`${this.apiBaseUrl}${endpoint}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      })
      return response.data as T
    } catch (error) {
      this.logger.error(`Failed to fetch from ${endpoint}`, error)
      throw error
    }
  }

  async sync(campaignId: number) {
    const ecanvasser = await this.findByCampaignId(campaignId)

    try {
      const [
        appointments,
        contacts,
        customFields,
        documents,
        efforts,
        followUps,
        houses,
        interactions,
        surveys,
        questions,
        teams,
        users,
      ] = await Promise.all([
        this.fetchFromApi('/appointments', ecanvasser.apiKey),
        this.fetchFromApi('/contacts', ecanvasser.apiKey),
        this.fetchFromApi('/custom-fields', ecanvasser.apiKey),
        this.fetchFromApi('/documents', ecanvasser.apiKey),
        this.fetchFromApi('/efforts', ecanvasser.apiKey),
        this.fetchFromApi('/follow-up-requests', ecanvasser.apiKey),
        this.fetchFromApi('/houses', ecanvasser.apiKey),
        this.fetchFromApi('/interactions', ecanvasser.apiKey),
        this.fetchFromApi('/surveys', ecanvasser.apiKey),
        this.fetchFromApi('/survey-questions', ecanvasser.apiKey),
        this.fetchFromApi('/teams', ecanvasser.apiKey),
        this.fetchFromApi('/users', ecanvasser.apiKey),
      ])

      return this.model.update({
        where: { id: ecanvasser.id },
        data: {
          appointments,
          contacts,
          customFields,
          documents,
          efforts,
          followUps,
          houses,
          interactions,
          surveys,
          questions,
          teams,
          users,
          lastSync: new Date(),
          error: null,
        },
      })
    } catch (error) {
      this.logger.error('Failed to sync with ecanvasser', error)

      return this.model.update({
        where: { id: ecanvasser.id },
        data: {
          lastSync: new Date(),
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      })
    }
  }
}
