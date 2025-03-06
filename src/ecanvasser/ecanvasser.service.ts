import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { CreateEcanvasserDto } from './dto/create-ecanvasser.dto'
import { UpdateEcanvasserDto } from './dto/update-ecanvasser.dto'
import { CampaignsService } from '../campaigns/services/campaigns.service'
import { HttpService } from '@nestjs/axios'
import { lastValueFrom } from 'rxjs'
import { Ecanvasser } from '@prisma/client'
import { EcanvasserSummary } from './ecanvasser.types'
import {
  ApiEcanvasserContact,
  ApiEcanvasserInteraction,
} from './ecanvasser.types'

const RECORDS_LIMIT = 10
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
      include: {
        contacts: true,
        houses: true,
        interactions: true,
      },
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

  private async fetchFromApi<T>(
    endpoint: string,
    apiKey: string,
  ): Promise<T[]> {
    try {
      const response = await lastValueFrom(
        this.httpService.get(`${this.apiBaseUrl}${endpoint}`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        }),
      )
      return response.data?.data as T[]
    } catch (error) {
      this.logger.error(`Failed to fetch from ${endpoint}`, error)
      throw error
    }
  }

  async sync(campaignId: number): Promise<Ecanvasser> {
    const ecanvasser = await this.findByCampaignId(campaignId)

    try {
      const [contacts, houses, interactions] = await Promise.all([
        this.fetchFromApi<ApiEcanvasserContact>(
          `/contact?limit=${RECORDS_LIMIT}`,
          ecanvasser.apiKey,
        ),
        this.fetchFromApi<any>(
          `/house?limit=${RECORDS_LIMIT}`,
          ecanvasser.apiKey,
        ),
        this.fetchFromApi<ApiEcanvasserInteraction>(
          `/interaction?limit=${RECORDS_LIMIT}`,
          ecanvasser.apiKey,
        ),
      ])

      // Delete existing records
      await this.model.update({
        where: { id: ecanvasser.id },
        data: {
          contacts: {
            deleteMany: {},
          },
          houses: {
            deleteMany: {},
          },
          interactions: {
            deleteMany: {},
          },
        },
      })

      // Create new records
      return this.model.update({
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
              homePhone: contact.contact_details.home || null,
              mobilePhone: contact.contact_details.mobile || null,
              email: contact.contact_details.email || null,
              actionId: contact.action_id || null,
              lastInteractionId: contact.last_interaction_id || null,
              createdBy: contact.created_by,
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
              createdBy: interaction.created_by,
              notes: null,
              source: null,
            })),
          },

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
    const ecanvassers = await this.model.findMany({
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
