import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { CreateEcanvasserDto } from './dto/create-ecanvasser.dto'
import { UpdateEcanvasserDto } from './dto/update-ecanvasser.dto'
import { CampaignsService } from '../campaigns/services/campaigns.service'
import { HttpService } from '@nestjs/axios'
import { lastValueFrom } from 'rxjs'
import { Ecanvasser } from '@prisma/client'
import { EcanvasserWithRelations, EcanvasserSummary } from './ecanvasser.types'

@Injectable()
export class EcanvasserService extends createPrismaBase(MODELS.Ecanvasser) {
  public readonly logger = new Logger(EcanvasserService.name)
  private readonly apiBaseUrl = 'https://public-api.ecanvasser.com'

  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly httpService: HttpService,
  ) {
    super()
  }

  async create(createEcanvasserDto: CreateEcanvasserDto): Promise<Ecanvasser> {
    const campaign = await this.campaignsService.findFirstOrThrow({
      where: {
        user: {
          email: createEcanvasserDto.email,
        },
      },
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

  async update(
    campaignId: number,
    updateEcanvasserDto: UpdateEcanvasserDto,
  ): Promise<Ecanvasser> {
    const ecanvasser = await this.findByCampaignId(campaignId)

    return this.model.update({
      where: { id: ecanvasser.id },
      data: updateEcanvasserDto,
    })
  }

  async remove(campaignId: number): Promise<void> {
    const ecanvasser = await this.findByCampaignId(campaignId)

    await this.model.delete({
      where: { id: ecanvasser.id },
    })
  }

  private async fetchFromApi<T>(endpoint: string, apiKey: string): Promise<T> {
    try {
      const response = await lastValueFrom(
        this.httpService.get(`${this.apiBaseUrl}${endpoint}`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        }),
      )
      return response.data?.data as T
    } catch (error) {
      this.logger.error(`Failed to fetch from ${endpoint}`, error)
      throw error
    }
  }

  async sync(campaignId: number): Promise<Ecanvasser> {
    const ecanvasser = await this.findByCampaignId(campaignId)

    const limit = 1000

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
        teams,
        users,
      ] = await Promise.all([
        this.fetchFromApi(`/appointment?limit=${limit}`, ecanvasser.apiKey),
        this.fetchFromApi(`/contact?limit=${limit}`, ecanvasser.apiKey),
        this.fetchFromApi(`/customfield?limit=${limit}`, ecanvasser.apiKey),
        this.fetchFromApi(`/document?limit=${limit}`, ecanvasser.apiKey),
        this.fetchFromApi(`/effort?limit=${limit}`, ecanvasser.apiKey),
        this.fetchFromApi(`/followuprequest?limit=${limit}`, ecanvasser.apiKey),
        this.fetchFromApi(`/house?limit=${limit}`, ecanvasser.apiKey),
        this.fetchFromApi(`/interaction?limit=${limit}`, ecanvasser.apiKey),
        this.fetchFromApi(`/survey?limit=${limit}`, ecanvasser.apiKey),
        this.fetchFromApi(`/team?limit=${limit}`, ecanvasser.apiKey),
        this.fetchFromApi(`/user?limit=${limit}`, ecanvasser.apiKey),
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

  async findAll(): Promise<EcanvasserSummary[]> {
    const ecanvassers = (await this.model.findMany({
      include: {
        campaign: {
          select: {
            id: true,
            user: {
              select: {
                email: true,
              },
            },
          },
        },
      },
    })) as EcanvasserWithRelations[]

    return ecanvassers.map((ecanvasser) => ({
      appointments: (ecanvasser.appointments as unknown[]).length ?? 0,
      contacts: (ecanvasser.contacts as unknown[]).length ?? 0,
      customFields: (ecanvasser.customFields as unknown[]).length ?? 0,
      documents: (ecanvasser.documents as unknown[]).length ?? 0,
      efforts: (ecanvasser.efforts as unknown[]).length ?? 0,
      followUps: (ecanvasser.followUps as unknown[]).length ?? 0,
      houses: (ecanvasser.houses as unknown[]).length ?? 0,
      interactions: (ecanvasser.interactions as unknown[]).length ?? 0,
      surveys: (ecanvasser.surveys as unknown[]).length ?? 0,
      questions: (ecanvasser.questions as unknown[]).length ?? 0,
      teams: (ecanvasser.teams as unknown[]).length ?? 0,
      users: (ecanvasser.users as unknown[]).length ?? 0,
      email: ecanvasser.campaign?.user?.email ?? null,
      campaignId: ecanvasser.campaign?.id,
      lastSync: ecanvasser.lastSync,
      error: ecanvasser.error,
    }))
  }

  async syncAll(): Promise<Ecanvasser[]> {
    const ecanvassers = await this.model.findMany()
    const results: Ecanvasser[] = []

    for (const ecanvasser of ecanvassers) {
      try {
        const result = await this.sync(ecanvasser.campaignId)
        results.push(result)
      } catch (error) {
        this.logger.error(
          `Failed to sync ecanvasser for campaign ${ecanvasser.campaignId}`,
          error,
        )
        results.push(
          await this.model.update({
            where: { id: ecanvasser.id },
            data: {
              lastSync: new Date(),
              error: error instanceof Error ? error.message : 'Unknown error',
            },
          }),
        )
      }

      // Wait 2 seconds before processing the next ecanvasser (rate limit is 300 requests per minute)
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }

    return results
  }
}
