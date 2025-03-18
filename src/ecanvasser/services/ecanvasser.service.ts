import {
  Injectable,
  Logger,
  forwardRef,
  Inject,
  NotFoundException,
  BadGatewayException,
} from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { CreateEcanvasserSchema } from '../dto/createEcanvasser.schema'
import { UpdateEcanvasserSchema } from '../dto/updateEcanvasser.schema'
import { CampaignsService } from '../../campaigns/services/campaigns.service'
import { HttpService } from '@nestjs/axios'
import { lastValueFrom } from 'rxjs'
import { Ecanvasser, EcanvasserInteraction } from '@prisma/client'
import slugify from 'slugify'
import {
  EcanvasserSummary,
  ApiEcanvasserContact,
  ApiEcanvasserInteraction,
  PaginationParams,
  ApiResponse,
  EcanvasserSummaryResponse,
  ApiEcanvasserSurvey,
  ApiEcanvasserSurveyQuestion,
  ApiEcanvasserTeam,
} from '../ecanvasser.types'
import { CrmCampaignsService } from 'src/campaigns/services/crmCampaigns.service'
import { SlackService } from 'src/shared/services/slack.service'
import { CreateSurveySchema } from '../dto/createSurvey.schema'
import { CreateSurveyQuestionSchema } from '../dto/createSurveyQuestion.schema'
import { UpdateSurveyQuestionSchema } from '../dto/updateSurveyQuestion.schema'
import { UpdateSurveySchema } from '../dto/updateSurvey.schema'
import { Methods } from 'http-constants-ts'

const DEFAULT_PAGE_SIZE = 1000
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000

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

  async mine(campaignId: number): Promise<Omit<Ecanvasser, 'apiKey'>> {
    const ecanvasser = await this.model.findFirstOrThrow({
      where: { campaignId },
    })
    const { apiKey, ...rest } = ecanvasser
    return rest
  }

  private getInteractionsByDay(interactions: EcanvasserInteraction[]) {
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

  private interactionsByStatus(
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

  private groupedRatings(
    interactions: EcanvasserInteraction[],
  ): Record<string, number> {
    return interactions.reduce((acc, interaction) => {
      const key = interaction.rating ? `${interaction.rating}` : 'unrated'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
  }

  async summary(campaignId: number): Promise<EcanvasserSummaryResponse> {
    const ecanvasser = await this.model.findFirstOrThrow({
      where: { campaignId },
      include: {
        contacts: true,
        houses: true,
        interactions: true,
      },
    })

    const interactionsByDay = this.getInteractionsByDay(ecanvasser.interactions)

    const summary = {
      totalContacts: ecanvasser.contacts.length,
      totalHouses: ecanvasser.houses.length,
      totalInteractions: ecanvasser.interactions.length,
      averageRating: this.calculateAverageRating(ecanvasser.interactions),
      groupedRatings: this.groupedRatings(ecanvasser.interactions),
      interactions: this.interactionsByStatus(ecanvasser.interactions),
      interactionsByDay,
      lastSync: ecanvasser.lastSync,
    }
    return summary
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

  private async fetchFromApi<T>(
    endpoint: string,
    apiKey: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
      data?: any
      params?: PaginationParams
    } = {},
  ): Promise<ApiResponse<T>> {
    try {
      const { method = Methods.GET, data, params = {} } = options
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

      const config = {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }

      let response
      switch (method) {
        case Methods.POST:
          response = await lastValueFrom(
            this.httpService.post(url, data, config),
          )
          break
        case Methods.PUT:
          response = await lastValueFrom(
            this.httpService.put(url, data, config),
          )
          break
        case Methods.DELETE:
          response = await lastValueFrom(this.httpService.delete(url, config))
          break
        default:
          response = await lastValueFrom(this.httpService.get(url, config))
      }

      return response.data as ApiResponse<T>
    } catch (error) {
      this.logger.error(
        `Failed to ${options.method || Methods.GET} ${endpoint}`,
        error,
      )
      throw new BadGatewayException('Failed to communicate with Ecanvasser API')
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

      const response = await this.fetchFromApi<T>(endpoint, apiKey, { params })

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
        await this.sync(ecanvasser.campaignId, true)
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

  async createSurvey(campaignId: number, createSurveyDto: CreateSurveySchema) {
    const ecanvasser = await this.findByCampaignId(campaignId)
    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser integration not found')
    }

    const payload = {
      name: createSurveyDto.name,
      description: createSurveyDto.description,
      requires_signature: createSurveyDto.requiresSignature,
      status: createSurveyDto.status,
      team_id: createSurveyDto.teamId,
    } as ApiEcanvasserSurvey

    try {
      const response = await this.fetchFromApi<ApiEcanvasserSurvey>(
        '/survey',
        ecanvasser.apiKey,
        {
          method: 'POST',
          data: payload,
        },
      )

      return response.data
    } catch (error) {
      this.logger.error('Failed to create survey', error)
      throw new BadGatewayException('Failed to create survey in Ecanvasser')
    }
  }

  async findSurveys(campaignId: number) {
    const ecanvasser = await this.findByCampaignId(campaignId)
    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser integration not found')
    }

    try {
      const response = await this.fetchFromApi<ApiEcanvasserSurvey>(
        '/survey',
        ecanvasser.apiKey,
      )

      return response.data
    } catch (error) {
      this.logger.error('Failed to fetch surveys', error)
      throw new BadGatewayException('Failed to fetch surveys from Ecanvasser')
    }
  }

  async createSurveyQuestion(
    campaignId: number,
    surveyId: number,
    createQuestionDto: CreateSurveyQuestionSchema,
  ) {
    const ecanvasser = await this.findByCampaignId(campaignId)
    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser integration not found')
    }
    const payload = {
      survey_id: surveyId,
      name: createQuestionDto.name,
      order: createQuestionDto.order,
      required: createQuestionDto.required,
      answer_type: {
        id: createQuestionDto.answerFormatId,
        name: createQuestionDto.answerFormatName,
      },
      answers: createQuestionDto.answers || undefined,
    }
    try {
      const response = await this.fetchFromApi<ApiEcanvasserSurveyQuestion>(
        `/survey/question`,
        ecanvasser.apiKey,
        {
          method: 'POST',
          data: payload,
        },
      )

      return response.data
    } catch (error) {
      this.logger.error('Failed to create survey question', error)
      throw new BadGatewayException(
        'Failed to create survey question in Ecanvasser',
      )
    }
  }

  async findSurvey(campaignId: number, surveyId: number) {
    const ecanvasser = await this.findByCampaignId(campaignId)
    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser integration not found')
    }

    try {
      const response = await this.fetchFromApi<ApiEcanvasserSurvey>(
        `/survey/${surveyId}`,
        ecanvasser.apiKey,
      )

      return response.data
    } catch (error) {
      this.logger.error('Failed to fetch survey', error)
      throw new BadGatewayException('Failed to fetch survey from Ecanvasser')
    }
  }

  async findTeams(campaignId: number) {
    const ecanvasser = await this.findByCampaignId(campaignId)
    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser integration not found')
    }

    try {
      const response = await this.fetchFromApi<ApiEcanvasserTeam>(
        '/team',
        ecanvasser.apiKey,
      )

      return response.data
    } catch (error) {
      this.logger.error('Failed to fetch teams', error)
      throw new BadGatewayException('Failed to fetch teams from Ecanvasser')
    }
  }

  async deleteSurveyQuestion(campaignId: number, questionId: number) {
    const ecanvasser = await this.findByCampaignId(campaignId)
    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser integration not found')
    }

    try {
      const response = await this.fetchFromApi(
        `/survey/question/${questionId}`,
        ecanvasser.apiKey,
        {
          method: 'DELETE',
        },
      )

      return response.data
    } catch (error) {
      this.logger.error('Failed to delete survey question', error)
      throw new BadGatewayException(
        'Failed to delete survey question in Ecanvasser',
      )
    }
  }

  async findSurveyQuestion(campaignId: number, questionId: number) {
    const ecanvasser = await this.findByCampaignId(campaignId)
    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser integration not found')
    }

    try {
      const response = await this.fetchFromApi<ApiEcanvasserSurveyQuestion>(
        `/survey/question/${questionId}`,
        ecanvasser.apiKey,
      )

      return response.data
    } catch (error) {
      this.logger.error('Failed to fetch survey question', error)
      throw new BadGatewayException(
        'Failed to fetch survey question from Ecanvasser',
      )
    }
  }

  async updateSurveyQuestion(
    campaignId: number,
    questionId: number,
    updateQuestionDto: UpdateSurveyQuestionSchema,
  ) {
    const ecanvasser = await this.findByCampaignId(campaignId)
    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser integration not found')
    }

    const payload = {
      survey_id: updateQuestionDto.surveyId,
      name: updateQuestionDto.name,
      answers: updateQuestionDto.answers,
    }

    try {
      const response = await this.fetchFromApi<ApiEcanvasserSurveyQuestion>(
        `/survey/question/${questionId}`,
        ecanvasser.apiKey,
        {
          method: 'PUT',
          data: payload,
        },
      )

      return response.data
    } catch (error) {
      this.logger.error('Failed to update survey question', error)
      throw new BadGatewayException(
        'Failed to update survey question in Ecanvasser',
      )
    }
  }

  async updateSurvey(
    campaignId: number,
    surveyId: number,
    updateSurveyDto: UpdateSurveySchema,
  ) {
    const ecanvasser = await this.findByCampaignId(campaignId)
    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser integration not found')
    }

    try {
      const response = await this.fetchFromApi<ApiEcanvasserSurvey>(
        `/survey/${surveyId}`,
        ecanvasser.apiKey,
        {
          method: 'PUT',
          data: updateSurveyDto,
        },
      )

      return response.data
    } catch (error) {
      this.logger.error('Failed to update survey', error)
      throw new BadGatewayException('Failed to update survey in Ecanvasser')
    }
  }

  async deleteSurvey(campaignId: number, surveyId: number) {
    const ecanvasser = await this.findByCampaignId(campaignId)
    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser integration not found')
    }

    try {
      const response = await this.fetchFromApi(
        `/survey/${surveyId}`,
        ecanvasser.apiKey,
        {
          method: 'DELETE',
        },
      )

      return response.data
    } catch (error) {
      this.logger.error('Failed to delete survey', error)
      throw new BadGatewayException('Failed to delete survey in Ecanvasser')
    }
  }
}
