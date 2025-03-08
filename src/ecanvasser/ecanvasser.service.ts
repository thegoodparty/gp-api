import {
  Injectable,
  Logger,
  forwardRef,
  Inject,
  NotFoundException,
} from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { CreateEcanvasserDto } from './dto/create-ecanvasser.dto'
import { UpdateEcanvasserDto } from './dto/update-ecanvasser.dto'
import { CampaignsService } from '../campaigns/services/campaigns.service'
import { HttpService } from '@nestjs/axios'
import { lastValueFrom } from 'rxjs'
import { Ecanvasser } from '@prisma/client'
import {
  EcanvasserSummary,
  ApiEcanvasserContact,
  ApiEcanvasserInteraction,
  PaginationParams,
  ApiResponse,
} from './ecanvasser.types'
import { CrmCampaignsService } from 'src/campaigns/services/crmCampaigns.service'
import { SlackService } from 'src/shared/services/slack.service'

const DEFAULT_PAGE_SIZE = 1000

@Injectable()
export class EcanvasserService extends createPrismaBase(MODELS.Ecanvasser) {
  public readonly logger = new Logger(EcanvasserService.name)
  private readonly apiBaseUrl = 'https://public-api.ecanvasser.com'

  constructor(
    @Inject(forwardRef(() => CampaignsService))
    private readonly campaignsService: CampaignsService,
    private readonly httpService: HttpService,
    @Inject(forwardRef(() => CrmCampaignsService))
    private readonly crm: CrmCampaignsService,
    private slack: SlackService,
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

    const ecanvasser = await this.model.create({
      data: {
        campaignId: campaign.id,
        apiKey: createEcanvasserDto.apiKey,
      },
    })

    await this.sync(campaign.id)

    return ecanvasser
  }

  async findByCampaignId(campaignId: number) {
    const ecanvasser = await this.model.findFirst({
      where: { campaignId },
      include: {
        contacts: true,
        houses: true,
        interactions: true,
      },
    })

    return ecanvasser
  }

  async update(
    campaignId: number,
    updateEcanvasserDto: UpdateEcanvasserDto,
  ): Promise<Ecanvasser> {
    const ecanvasser = await this.findByCampaignId(campaignId)

    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser integration not found')
    }

    return this.model.update({
      where: { id: ecanvasser.id },
      data: updateEcanvasserDto,
    })
  }

  async remove(campaignId: number): Promise<void> {
    const ecanvasser = await this.findByCampaignId(campaignId)

    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser integration not found')
    }

    await this.model.delete({
      where: { id: ecanvasser.id },
    })
  }

  private async fetchFromApi<T>(
    endpoint: string,
    apiKey: string,
    params: PaginationParams = {},
  ): Promise<ApiResponse<T>> {
    try {
      const queryParams = new URLSearchParams()

      if (params.limit) {
        queryParams.append('limit', params.limit.toString())
      }
      if (params.order) {
        queryParams.append('order', params.order)
      }
      if (params.after_id) {
        queryParams.append('after_id', params.after_id.toString())
      }
      if (params.before_id) {
        queryParams.append('before_id', params.before_id.toString())
      }
      if (params.start_date) {
        queryParams.append('start_date', params.start_date)
      }

      const url = `${this.apiBaseUrl}${endpoint}${
        queryParams.toString() ? `?${queryParams.toString()}` : ''
      }`

      const response = await lastValueFrom(
        this.httpService.get(url, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        }),
      )
      return response.data as ApiResponse<T>
    } catch (error) {
      this.logger.error(`Failed to fetch from ${endpoint}`, error)
      throw error
    }
  }

  private async fetchAllPages<T>(
    endpoint: string,
    apiKey: string,
    startDate?: Date,
  ): Promise<T[]> {
    const allData: T[] = []
    let hasMore = true
    let lastId: number | undefined

    const params: PaginationParams = {
      limit: DEFAULT_PAGE_SIZE,
      order: 'asc',
    }

    if (startDate) {
      params.start_date = startDate
        .toISOString()
        .replace('T', ' ')
        .replace(/\.\d+Z$/, '')
    }

    while (hasMore) {
      if (lastId) {
        params.after_id = lastId
      }

      const response = await this.fetchFromApi<T>(endpoint, apiKey, params)

      if (!response.data.length) {
        break
      }

      allData.push(...response.data)

      if (response.meta.links.next) {
        lastId = response.meta.ids.last
      } else {
        hasMore = false
      }

      await this.sleep(1000)
    }

    return allData
  }

  async sync(campaignId: number): Promise<Ecanvasser> {
    const ecanvasser = await this.findByCampaignId(campaignId)

    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser integration not found')
    }

    const startDate = ecanvasser.lastSync || undefined

    try {
      const contacts = await this.fetchAllPages<ApiEcanvasserContact>(
        '/contact',
        ecanvasser.apiKey,
        startDate,
      )

      const houses = await this.fetchAllPages<any>(
        '/house',
        ecanvasser.apiKey,
        startDate,
      )

      const interactions = await this.fetchAllPages<ApiEcanvasserInteraction>(
        '/interaction',
        ecanvasser.apiKey,
        startDate,
      )

      // Delete existing records only if we're doing a full sync
      if (!startDate) {
        await this.model.update({
          where: { id: ecanvasser.id },
          data: {
            contacts: { deleteMany: {} },
            houses: { deleteMany: {} },
            interactions: { deleteMany: {} },
          },
        })
      }

      // Create or update records
      const updated = this.model.update({
        where: { id: ecanvasser.id },
        data: {
          contacts: {
            create: contacts.map((contact) => ({
              firstName: contact.first_name,
              lastName: contact.last_name,
              type: contact.type,
              gender: contact.gender || null,
              dateOfBirth: contact.date_of_birth
                ? new Date(contact.date_of_birth)
                : null,
              yearOfBirth: contact.year_of_birth?.toString() || null,
              houseId: contact.house_id || null,
              uniqueIdentifier: contact.unique_identifier || null,
              organization: contact.organization || null,
              volunteer: contact.volunteer,
              deceased: contact.deceased,
              donor: contact.donor,
              homePhone: contact.contact_details?.home || null,
              mobilePhone: contact.contact_details?.mobile || null,
              email: contact.contact_details?.email || null,
              actionId: contact.action_id || null,
              lastInteractionId: contact.last_interaction_id || null,
              createdBy: contact.created_by || 0,
            })),
          },
          houses: {
            create: houses.map((house) => ({
              address: house.address,
              latitude: house.latitude || null,
              longitude: house.longitude || null,
              uniqueIdentifier: house.unique_identifier || null,
              externalId: house.external_id || null,
            })),
          },
          interactions: {
            create: interactions.map((interaction) => ({
              type: interaction.type,
              status: interaction.status.name,
              contactId: interaction.contact_id || 0,
              createdBy: interaction.created_by || 0,
            })),
          },
          lastSync: new Date(),
          error: null,
        },
      })
      this.crm.trackCampaign(campaignId)
      return updated
    } catch (error) {
      this.logger.error('Failed to sync with ecanvasser', error)
      await this.slack.errorMessage({
        message: `Failed to sync with ecanvasser for campaign ${ecanvasser.campaignId}`,
        error,
      })
      return this.model.update({
        where: { id: ecanvasser.id },
        data: {
          lastSync: startDate,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      })
    }
  }

  async findAll(): Promise<EcanvasserSummary[]> {
    const ecanvassers = await this.model.findMany({
      orderBy: {
        createdAt: 'desc',
      },
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
        contacts: true,
        houses: true,
        interactions: true,
      },
    })

    return ecanvassers.map((ecanvasser) => ({
      contacts: ecanvasser.contacts.length,
      houses: ecanvasser.houses.length,
      interactions: ecanvasser.interactions.length,
      email: ecanvasser.campaign?.user?.email ?? null,
      campaignId: ecanvasser.campaign?.id,
      lastSync: ecanvasser.lastSync,
      error: ecanvasser.error,
    }))
  }

  async syncAll(): Promise<void> {
    const ecanvassers = await this.model.findMany()

    for (const ecanvasser of ecanvassers) {
      try {
        await this.sync(ecanvasser.campaignId)
      } catch (error) {
        this.logger.error(
          `Failed to sync ecanvasser for campaign ${ecanvasser.campaignId}`,
          error,
        )
      }

      // Wait before processing the next ecanvasser (rate limit is 300 requests per minute)
      await this.sleep(5000)
    }
  }

  private async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }
}
