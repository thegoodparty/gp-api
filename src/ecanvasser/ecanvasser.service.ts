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
  ApiEcanvasserCustomField,
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
        appointments: true,
        contacts: true,
        customFields: true,
        documents: true,
        efforts: true,
        followUps: true,
        houses: true,
        interactions: true,
        surveys: true,
        teams: true,
        users: true,
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
        this.fetchFromApi<any>(
          `/appointment?limit=${RECORDS_LIMIT}`,
          ecanvasser.apiKey,
        ),
        this.fetchFromApi<ApiEcanvasserContact>(
          `/contact?limit=${RECORDS_LIMIT}`,
          ecanvasser.apiKey,
        ),
        this.fetchFromApi<ApiEcanvasserCustomField>(
          `/customfield?limit=${RECORDS_LIMIT}`,
          ecanvasser.apiKey,
        ),
        this.fetchFromApi<any>(
          `/document?limit=${RECORDS_LIMIT}`,
          ecanvasser.apiKey,
        ),
        this.fetchFromApi<any>(
          `/effort?limit=${RECORDS_LIMIT}`,
          ecanvasser.apiKey,
        ),
        this.fetchFromApi<any>(
          `/followuprequest?limit=${RECORDS_LIMIT}`,
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
        this.fetchFromApi<any>(
          `/survey?limit=${RECORDS_LIMIT}`,
          ecanvasser.apiKey,
        ),
        this.fetchFromApi<any>(
          `/team?limit=${RECORDS_LIMIT}`,
          ecanvasser.apiKey,
        ),
        this.fetchFromApi<any>(
          `/user?limit=${RECORDS_LIMIT}`,
          ecanvasser.apiKey,
        ),
      ])

      // Delete existing records
      await this.model.update({
        where: { id: ecanvasser.id },
        data: {
          appointments: {
            deleteMany: {},
          },
          contacts: {
            deleteMany: {},
          },
          customFields: {
            deleteMany: {},
          },
          documents: {
            deleteMany: {},
          },
          efforts: {
            deleteMany: {},
          },
          followUps: {
            deleteMany: {},
          },
          houses: {
            deleteMany: {},
          },
          interactions: {
            deleteMany: {},
          },
          surveys: {
            deleteMany: {},
          },
          teams: {
            deleteMany: {},
          },
          users: {
            deleteMany: {},
          },
        },
      })

      // Create new records
      return this.model.update({
        where: { id: ecanvasser.id },
        data: {
          appointments: {
            create: appointments.map((appointment) => ({
              name: appointment.name,
              description: appointment.description || null,
              scheduledFor: appointment.scheduledFor
                ? new Date(appointment.scheduledFor)
                : null,
              status: appointment.status,
              createdBy: appointment.createdBy,
              updatedBy: appointment.updatedBy,
              assignedTo: appointment.assignedTo,
              canvassId: appointment.canvassId,
              contactId: appointment.contactId,
              houseId: appointment.houseId,
            })),
          },
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
          customFields: {
            create: customFields.map((field) => ({
              name: field.name,
              createdBy: field.created_by,
              typeId: field.type.id,
              typeName: field.type.name,
              defaultValue: field.default || null,
              nationbuilderSlug: field.nationbuilder_slug || null,
            })),
          },
          documents: {
            create: documents.map((doc) => ({
              fileName: doc.file_name,
              createdBy: doc.created_by,
              fileSize: doc.file_size || null,
              type: doc.type,
            })),
          },
          efforts: {
            create: efforts.map((effort) => ({
              description: effort.description || '',
              name: effort.name,
              status: effort.status || 'Active',
              createdBy: effort.created_by || 0,
              updatedBy: effort.updated_by || 0,
              icon: effort.icon || 'default_icon',
            })),
          },
          followUps: {
            create: followUps.map((followUp) => ({
              details: followUp.details,
              priority: followUp.priority,
              status: followUp.status,
              origin: followUp.origin,
              contactId: followUp.contact_id,
              interactionId: followUp.interaction_id || null,
              assignedTo: followUp.assigned_to || null,
              createdBy: followUp.created_by,
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
          surveys: {
            create: surveys.map((survey) => ({
              name: survey.name,
              description: survey.description || null,
              requiresSignature: survey.requires_signature,
              nationbuilderId: survey.nationbuilder_id || null,
              status: survey.status,
              teamId: survey.team_id || null,
              createdBy: survey.created_by,
            })),
          },
          teams: {
            create: teams.map((team) => ({
              name: team.name,
              description: team.description || '',
              type: team.type || 'Default',
              status: team.status || 'Active',
              createdBy: team.created_by || 0,
            })),
          },
          users: {
            create: users.map((user) => ({
              firstName: user.first_name,
              lastName: user.last_name,
              email: user.email,
              phone: user.phone || null,
              type: user.type || 'Default',
              status: user.status || 'Active',
              createdBy: user.created_by || 0,
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
        appointments: true,
        contacts: true,
        customFields: true,
        documents: true,
        efforts: true,
        followUps: true,
        houses: true,
        interactions: true,
        surveys: true,
        teams: true,
        users: true,
      },
    })

    return ecanvassers.map((ecanvasser) => ({
      appointments: ecanvasser.appointments.length,
      contacts: ecanvasser.contacts.length,
      customFields: ecanvasser.customFields.length,
      documents: ecanvasser.documents.length,
      efforts: ecanvasser.efforts.length,
      followUps: ecanvasser.followUps.length,
      houses: ecanvasser.houses.length,
      interactions: ecanvasser.interactions.length,
      surveys: ecanvasser.surveys.length,
      teams: ecanvasser.teams.length,
      users: ecanvasser.users.length,
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
