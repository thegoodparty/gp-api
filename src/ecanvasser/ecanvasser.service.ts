import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { CreateEcanvasserDto } from './dto/create-ecanvasser.dto'
import { UpdateEcanvasserDto } from './dto/update-ecanvasser.dto'
import { CampaignsService } from '../campaigns/services/campaigns.service'
import { HttpService } from '@nestjs/axios'
import { lastValueFrom } from 'rxjs'
import { Ecanvasser } from '@prisma/client'
import {
  EcanvasserSummary,
  EcanvasserAppointment,
  EcanvasserContact,
  EcanvasserCustomField,
  EcanvasserDocument,
  EcanvasserEffort,
  EcanvasserFollowUp,
  EcanvasserHouse,
  EcanvasserInteraction,
  EcanvasserSurvey,
  EcanvasserQuestion,
  EcanvasserTeam,
  EcanvasserUser,
} from './ecanvasser.types'

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
        questions: true,
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
        questions,
        teams,
        users,
      ] = await Promise.all([
        this.fetchFromApi<EcanvasserAppointment>(
          `/appointment?limit=${limit}`,
          ecanvasser.apiKey,
        ),
        this.fetchFromApi<EcanvasserContact>(
          `/contact?limit=${limit}`,
          ecanvasser.apiKey,
        ),
        this.fetchFromApi<EcanvasserCustomField>(
          `/customfield?limit=${limit}`,
          ecanvasser.apiKey,
        ),
        this.fetchFromApi<EcanvasserDocument>(
          `/document?limit=${limit}`,
          ecanvasser.apiKey,
        ),
        this.fetchFromApi<EcanvasserEffort>(
          `/effort?limit=${limit}`,
          ecanvasser.apiKey,
        ),
        this.fetchFromApi<EcanvasserFollowUp>(
          `/followuprequest?limit=${limit}`,
          ecanvasser.apiKey,
        ),
        this.fetchFromApi<EcanvasserHouse>(
          `/house?limit=${limit}`,
          ecanvasser.apiKey,
        ),
        this.fetchFromApi<EcanvasserInteraction>(
          `/interaction?limit=${limit}`,
          ecanvasser.apiKey,
        ),
        this.fetchFromApi<EcanvasserSurvey>(
          `/survey?limit=${limit}`,
          ecanvasser.apiKey,
        ),
        this.fetchFromApi<EcanvasserQuestion>(
          `/question?limit=${limit}`,
          ecanvasser.apiKey,
        ),
        this.fetchFromApi<EcanvasserTeam>(
          `/team?limit=${limit}`,
          ecanvasser.apiKey,
        ),
        this.fetchFromApi<EcanvasserUser>(
          `/user?limit=${limit}`,
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
          questions: {
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
              description: appointment.description,
              scheduledFor: appointment.scheduled_for
                ? new Date(appointment.scheduled_for)
                : null,
              status: appointment.status,
              createdBy: appointment.created_by,
              updatedBy: appointment.updated_by,
              assignedTo: appointment.assigned_to,
              canvassId: appointment.canvass_id,
              contactId: appointment.contact_id,
              houseId: appointment.house_id,
            })),
          },
          contacts: {
            create: contacts.map((contact) => ({
              firstName: contact.first_name,
              lastName: contact.last_name,
              type: contact.type,
              gender: contact.gender,
              dateOfBirth: contact.date_of_birth
                ? new Date(contact.date_of_birth)
                : null,
              yearOfBirth: contact.year_of_birth,
              houseId: contact.house_id,
              uniqueIdentifier: contact.unique_identifier,
              organization: contact.organization,
              volunteer: contact.volunteer,
              deceased: contact.deceased,
              donor: contact.donor,
              homePhone: contact.home_phone,
              mobilePhone: contact.mobile_phone,
              email: contact.email,
              actionId: contact.action_id,
              lastInteractionId: contact.last_interaction_id,
              createdBy: contact.created_by,
            })),
          },
          customFields: {
            create: customFields.map((field) => ({
              name: field.name,
              createdBy: field.created_by,
              typeId: field.type_id,
              typeName: field.type_name,
              defaultValue: field.default_value,
              nationbuilderSlug: field.nationbuilder_slug,
            })),
          },
          documents: {
            create: documents.map((doc) => ({
              fileName: doc.file_name,
              createdBy: doc.created_by,
              fileSize: doc.file_size,
              type: doc.type,
            })),
          },
          efforts: {
            create: efforts.map((effort) => ({
              description: effort.description,
              name: effort.name,
              status: effort.status,
              createdBy: effort.created_by,
              updatedBy: effort.updated_by,
              icon: effort.icon,
            })),
          },
          followUps: {
            create: followUps.map((followUp) => ({
              details: followUp.details,
              priority: followUp.priority,
              status: followUp.status,
              origin: followUp.origin,
              contactId: followUp.contact_id,
              interactionId: followUp.interaction_id,
              assignedTo: followUp.assigned_to,
              createdBy: followUp.created_by,
            })),
          },
          houses: {
            create: houses.map((house) => ({
              unit: house.unit,
              number: house.number,
              name: house.name,
              address: house.address,
              city: house.city,
              state: house.state,
              latitude: house.latitude,
              longitude: house.longitude,
              source: house.source,
              locationType: house.location_type,
              lastInteractionId: house.last_interaction_id,
              actionId: house.action_id,
              buildingId: house.building_id,
              type: house.type,
              zipCode: house.zip_code,
              precinct: house.precinct,
              notes: house.notes,
              createdBy: house.created_by,
            })),
          },
          interactions: {
            create: interactions.map((interaction) => ({
              rating: interaction.rating,
              statusId: interaction.status_id,
              statusName: interaction.status_name,
              statusDescription: interaction.status_description,
              statusColor: interaction.status_color,
              effortId: interaction.effort_id,
              contactId: interaction.contact_id,
              houseId: interaction.house_id,
              type: interaction.type,
              actionId: interaction.action_id,
              createdBy: interaction.created_by,
            })),
          },
          surveys: {
            create: surveys.map((survey) => ({
              name: survey.name,
              description: survey.description,
              requiresSignature: survey.requires_signature,
              nationbuilderId: survey.nationbuilder_id,
              status: survey.status,
              teamId: survey.team_id,
              createdBy: survey.created_by,
            })),
          },
          questions: {
            create: questions.map((question) => ({
              surveyId: question.survey_id,
              name: question.name,
              answerTypeId: question.answer_type_id,
              answerTypeName: question.answer_type_name,
              order: question.order,
              required: question.required,
            })),
          },
          teams: {
            create: teams.map((team) => ({
              name: team.name,
              color: team.color,
              createdBy: team.created_by,
            })),
          },
          users: {
            create: users.map((user) => ({
              firstName: user.first_name,
              lastName: user.last_name,
              permission: user.permission,
              email: user.email,
              phoneNumber: user.phone_number,
              countryCode: user.country_code,
              joined: new Date(user.joined),
              billing: user.billing,
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
        questions: true,
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
      questions: ecanvasser.questions.length,
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
