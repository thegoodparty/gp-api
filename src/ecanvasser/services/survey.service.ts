import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { EcanvasserService } from './ecanvasser.service'
import { EcanvasserApiUtil } from '../util/ecanvasser.util'
import {
  ApiEcanvasserSurvey,
  ApiEcanvasserSurveyQuestion,
  ApiEcanvasserTeam,
} from '../ecanvasser.types'
import { CreateSurveyDto } from '../dto/create-survey.dto'
import { CreateSurveyQuestionDto } from '../dto/create-survey-question.dto'
import { UpdateSurveyQuestionDto } from '../dto/update-survey-question.dto'
import { UpdateSurveyDto } from '../dto/update-survey.dto'

@Injectable()
export class SurveyService {
  private readonly logger = new Logger(SurveyService.name)
  private readonly apiUtil: EcanvasserApiUtil

  constructor(
    private readonly httpService: HttpService,
    private readonly ecanvasserService: EcanvasserService,
  ) {
    this.apiUtil = new EcanvasserApiUtil(httpService)
  }

  async createSurvey(campaignId: number, createSurveyDto: CreateSurveyDto) {
    const ecanvasser = await this.ecanvasserService.findByCampaignId(campaignId)
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
      const response = await this.apiUtil.fetchFromApi<ApiEcanvasserSurvey>(
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
      throw error
    }
  }

  async findSurveys(campaignId: number) {
    const ecanvasser = await this.ecanvasserService.findByCampaignId(campaignId)
    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser integration not found')
    }

    try {
      const response = await this.apiUtil.fetchFromApi<ApiEcanvasserSurvey>(
        '/survey',
        ecanvasser.apiKey,
      )

      return response.data
    } catch (error) {
      this.logger.error('Failed to fetch surveys', error)
      throw error
    }
  }

  async createSurveyQuestion(
    campaignId: number,
    surveyId: number,
    createQuestionDto: CreateSurveyQuestionDto,
  ) {
    const ecanvasser = await this.ecanvasserService.findByCampaignId(campaignId)
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
      const response =
        await this.apiUtil.fetchFromApi<ApiEcanvasserSurveyQuestion>(
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
      throw error
    }
  }

  async findSurvey(campaignId: number, surveyId: number) {
    const ecanvasser = await this.ecanvasserService.findByCampaignId(campaignId)
    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser integration not found')
    }

    try {
      const response = await this.apiUtil.fetchFromApi<ApiEcanvasserSurvey>(
        `/survey/${surveyId}`,
        ecanvasser.apiKey,
      )

      return response.data
    } catch (error) {
      this.logger.error('Failed to fetch survey', error)
      throw error
    }
  }

  async findTeams(campaignId: number) {
    const ecanvasser = await this.ecanvasserService.findByCampaignId(campaignId)
    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser integration not found')
    }

    try {
      const response = await this.apiUtil.fetchFromApi<ApiEcanvasserTeam>(
        '/team',
        ecanvasser.apiKey,
      )

      return response.data
    } catch (error) {
      this.logger.error('Failed to fetch teams', error)
      throw error
    }
  }

  async deleteSurveyQuestion(campaignId: number, questionId: number) {
    const ecanvasser = await this.ecanvasserService.findByCampaignId(campaignId)
    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser integration not found')
    }

    try {
      const response = await this.apiUtil.fetchFromApi(
        `/survey/question/${questionId}`,
        ecanvasser.apiKey,
        {
          method: 'DELETE',
        },
      )

      return response.data
    } catch (error) {
      this.logger.error('Failed to delete survey question', error)
      throw error
    }
  }

  async findSurveyQuestion(campaignId: number, questionId: number) {
    const ecanvasser = await this.ecanvasserService.findByCampaignId(campaignId)
    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser integration not found')
    }

    try {
      const response =
        await this.apiUtil.fetchFromApi<ApiEcanvasserSurveyQuestion>(
          `/survey/question/${questionId}`,
          ecanvasser.apiKey,
        )

      return response.data
    } catch (error) {
      this.logger.error('Failed to fetch survey question', error)
      throw error
    }
  }

  async updateSurveyQuestion(
    campaignId: number,
    questionId: number,
    updateQuestionDto: UpdateSurveyQuestionDto,
  ) {
    const ecanvasser = await this.ecanvasserService.findByCampaignId(campaignId)
    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser integration not found')
    }

    const payload = {
      survey_id: updateQuestionDto.surveyId,
      name: updateQuestionDto.name,
      answers: updateQuestionDto.answers,
    }

    try {
      const response =
        await this.apiUtil.fetchFromApi<ApiEcanvasserSurveyQuestion>(
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
      throw error
    }
  }

  async updateSurvey(
    campaignId: number,
    surveyId: number,
    updateSurveyDto: UpdateSurveyDto,
  ) {
    const ecanvasser = await this.ecanvasserService.findByCampaignId(campaignId)
    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser integration not found')
    }

    try {
      const response = await this.apiUtil.fetchFromApi<ApiEcanvasserSurvey>(
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
      throw error
    }
  }

  async deleteSurvey(campaignId: number, surveyId: number) {
    const ecanvasser = await this.ecanvasserService.findByCampaignId(campaignId)
    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser integration not found')
    }

    try {
      const response = await this.apiUtil.fetchFromApi(
        `/survey/${surveyId}`,
        ecanvasser.apiKey,
        {
          method: 'DELETE',
        },
      )

      return response.data
    } catch (error) {
      this.logger.error('Failed to delete survey', error)
      throw error
    }
  }
}
