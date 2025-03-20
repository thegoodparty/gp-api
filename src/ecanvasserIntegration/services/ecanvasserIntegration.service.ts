import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { CreateEcanvasserSchema } from '../schemas/createEcanvasser.schema'
import { UpdateEcanvasserSchema } from '../schemas/updateEcanvasser.schema'
import { CampaignsService } from '../../campaigns/services/campaigns.service'
import { Ecanvasser, EcanvasserInteraction } from '@prisma/client'
import slugify from 'slugify'
import { EcanvasserSummary } from '../ecanvasserIntegration.types'
import { CrmCampaignsService } from 'src/campaigns/services/crmCampaigns.service'
import { SlackService } from 'src/shared/services/slack.service'
import { EcanvasserService } from './ecanvasser.service'

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000

@Injectable()
export class EcanvasserIntegrationService extends createPrismaBase(
  MODELS.Ecanvasser,
) {
  public readonly logger = new Logger(EcanvasserIntegrationService.name)

  constructor(
    @Inject(forwardRef(() => CampaignsService))
    private readonly campaignsService: CampaignsService,
    private readonly ecanvasser: EcanvasserService,
    @Inject(forwardRef(() => CrmCampaignsService))
    private readonly crm: CrmCampaignsService,
    private slack: SlackService,
  ) {
    super()
  }

  async create(
    createEcanvasserDto: CreateEcanvasserSchema,
  ): Promise<Ecanvasser> {
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
        // TODO: We store the apiKey encrypted.
        apiKey: createEcanvasserDto.apiKey,
      },
    })

    await this.sync(campaign.id)

    return ecanvasser
  }

  async findByCampaignId(campaignId: number) {
    return await this.model.findFirst({
      where: { campaignId },
      include: {
        contacts: true,
        houses: true,
        interactions: true,
      },
    })
  }

  async mine(campaignId: number): Promise<Omit<Ecanvasser, 'apiKey'>> {
    const ecanvasser = await this.model.findFirstOrThrow({
      where: { campaignId },
    })
    const { apiKey, ...rest } = ecanvasser
    return rest
  }

  private groupInteractionsByDay(interactions: EcanvasserInteraction[]) {
    const recentInteractions = interactions.filter(
      (interaction) =>
        interaction.createdAt > new Date(Date.now() - THIRTY_DAYS),
    )

    return recentInteractions.reduce((acc, interaction) => {
      const date = interaction.date.toISOString().split('T')[0]
      if (!acc[date]) {
        acc[date] = { count: 0 }
      }
      acc[date].count++
      if (!acc[date][interaction.status]) {
        acc[date][interaction.status] = 0
      }
      acc[date][interaction.status]++
      return acc
    }, {})
  }

  private calculateAverageRating(
    interactions: EcanvasserInteraction[],
  ): number {
    const ratedInteractions = interactions.filter((i) => i.rating)
    if (ratedInteractions.length === 0) return 0

    const sum = ratedInteractions.reduce(
      (total, interaction) => total + (interaction.rating || 0),
      0,
    )
    return sum / ratedInteractions.length
  }

  private groupInteractionsByStatus(
    interactions: EcanvasserInteraction[],
  ): Record<string, number> {
    return interactions.reduce(
      (acc, interaction) => {
        const key = slugify(interaction.status, { lower: true })
        acc[key] = (acc[key] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )
  }

  private groupInteractionsByRatings(
    interactions: EcanvasserInteraction[],
  ): Record<string, number> {
    return interactions.reduce((acc, interaction) => {
      const key = interaction.rating ? `${interaction.rating}` : 'unrated'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
  }

  async summary(campaignId: number) {
    const ecanvasser = await this.model.findFirstOrThrow({
      where: { campaignId },
      include: {
        contacts: true,
        houses: true,
        interactions: true,
      },
    })

    const interactionsByDay = this.groupInteractionsByDay(
      ecanvasser.interactions,
    )

    return {
      totalContacts: ecanvasser.contacts.length,
      totalHouses: ecanvasser.houses.length,
      totalInteractions: ecanvasser.interactions.length,
      averageRating: this.calculateAverageRating(ecanvasser.interactions),
      groupedRatings: this.groupInteractionsByRatings(ecanvasser.interactions),
      interactions: this.groupInteractionsByStatus(ecanvasser.interactions),
      interactionsByDay,
      lastSync: ecanvasser.lastSync,
    }
  }

  async update(
    campaignId: number,
    updateEcanvasserDto: UpdateEcanvasserSchema,
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

  async sync(campaignId: number, force?: boolean): Promise<Ecanvasser> {
    const ecanvasser = await this.findByCampaignId(campaignId)

    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser integration not found')
    }
    // Check if we should sync based on last sync time
    if (!force && ecanvasser.lastSync) {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000)
      const lastSyncDate = new Date(ecanvasser.lastSync)
      if (lastSyncDate > thirtyMinutesAgo) {
        return ecanvasser // Return existing data if last sync was less than 30 minutes ago
      }
    }

    const startDate = ecanvasser.lastSync || undefined

    try {
      const contacts = await this.ecanvasser.fetchContacts(
        ecanvasser.apiKey,
        startDate,
      )

      const houses = await this.ecanvasser.fetchHouses(
        ecanvasser.apiKey,
        startDate,
      )

      const interactions = await this.ecanvasser.fetchInteractions(
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
            })),
          },
          interactions: {
            create: interactions.map((interaction) => ({
              type: interaction.type,
              status: interaction.status.name,
              contactId: interaction.contact_id || 0,
              createdBy: interaction.created_by || 0,
              date: interaction.created_at,
              rating: interaction.rating || null,
            })),
          },
          lastSync: new Date(),
          error: null,
        },
      })
      this.crm.trackCampaign(campaignId)
      return updated
    } catch (error) {
      this.logger.error('Failed to sync with ecanvasserIntegration', error)
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
        await this.sync(ecanvasser.campaignId, true)
      } catch (error) {
        this.logger.error(
          `Failed to sync ecanvasser for campaign ${ecanvasser.campaignId}`,
          error,
        )
      }
    }
  }
}
