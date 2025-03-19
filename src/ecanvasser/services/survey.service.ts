import { Injectable, NotFoundException } from '@nestjs/common'
import { EcanvasserService } from './ecanvasser.service'
import { CreateSurveySchema } from '../dto/createSurvey.schema'
import { CreateSurveyQuestionSchema } from '../dto/createSurveyQuestion.schema'
import { UpdateSurveyQuestionSchema } from '../dto/updateSurveyQuestion.schema'
import { UpdateSurveySchema } from '../dto/updateSurvey.schema'
import {
  ApiEcanvasserSurvey,
  ApiEcanvasserSurveyQuestion,
  ApiEcanvasserTeam,
} from '../ecanvasser.types'
import { EcanvasserApiService } from './ecanvasserAPI.service'

@Injectable()
export class SurveyService {
  constructor(
    private readonly ecanvasserService: EcanvasserService,
    private readonly ecanvasserApi: EcanvasserApiService,
  ) {}

  async createSurvey(campaignId: number, createSurveyDto: CreateSurveySchema) {
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
    }

    const response = await this.ecanvasserApi.fetchFromApi<ApiEcanvasserSurvey>(
      '/survey',
      ecanvasser.apiKey,
      {
        method: 'POST',
        data: payload,
      },
    )

    return response.data
  }

  async findSurveys(campaignId: number) {
    const ecanvasser = await this.ecanvasserService.findByCampaignId(campaignId)
    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser integration not found')
    }

    const response = await this.ecanvasserApi.fetchFromApi<ApiEcanvasserSurvey>(
      '/survey',
      ecanvasser.apiKey,
    )

    return response.data
  }

  async findSurvey(campaignId: number, surveyId: number) {
    const ecanvasser = await this.ecanvasserService.findByCampaignId(campaignId)
    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser integration not found')
    }

    const response = await this.ecanvasserApi.fetchFromApi<ApiEcanvasserSurvey>(
      `/survey/${surveyId}`,
      ecanvasser.apiKey,
    )

    return response.data
  }

  async updateSurvey(
    campaignId: number,
    surveyId: number,
    updateSurveyDto: UpdateSurveySchema,
  ) {
    const ecanvasser = await this.ecanvasserService.findByCampaignId(campaignId)
    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser integration not found')
    }

    const response = await this.ecanvasserApi.fetchFromApi<ApiEcanvasserSurvey>(
      `/survey/${surveyId}`,
      ecanvasser.apiKey,
      {
        method: 'PUT',
        data: updateSurveyDto,
      },
    )

    return response.data
  }

  async deleteSurvey(campaignId: number, surveyId: number) {
    const ecanvasser = await this.ecanvasserService.findByCampaignId(campaignId)
    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser integration not found')
    }

    const response = await this.ecanvasserApi.fetchFromApi(
      `/survey/${surveyId}`,
      ecanvasser.apiKey,
      {
        method: 'DELETE',
      },
    )

    return response.data
  }

  async createSurveyQuestion(
    campaignId: number,
    surveyId: number,
    createQuestionDto: CreateSurveyQuestionSchema,
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

    const response =
      await this.ecanvasserApi.fetchFromApi<ApiEcanvasserSurveyQuestion>(
        '/survey/question',
        ecanvasser.apiKey,
        {
          method: 'POST',
          data: payload,
        },
      )

    return response.data
  }

  async findSurveyQuestion(campaignId: number, questionId: number) {
    const ecanvasser = await this.ecanvasserService.findByCampaignId(campaignId)
    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser integration not found')
    }

    const response =
      await this.ecanvasserApi.fetchFromApi<ApiEcanvasserSurveyQuestion>(
        `/survey/question/${questionId}`,
        ecanvasser.apiKey,
      )

    return response.data
  }

  async updateSurveyQuestion(
    campaignId: number,
    questionId: number,
    updateQuestionDto: UpdateSurveyQuestionSchema,
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

    const response =
      await this.ecanvasserApi.fetchFromApi<ApiEcanvasserSurveyQuestion>(
        `/survey/question/${questionId}`,
        ecanvasser.apiKey,
        {
          method: 'PUT',
          data: payload,
        },
      )

    return response.data
  }

  async deleteSurveyQuestion(campaignId: number, questionId: number) {
    const ecanvasser = await this.ecanvasserService.findByCampaignId(campaignId)
    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser integration not found')
    }

    const response = await this.ecanvasserApi.fetchFromApi(
      `/survey/question/${questionId}`,
      ecanvasser.apiKey,
      {
        method: 'DELETE',
      },
    )

    return response.data
  }

  async findTeams(campaignId: number) {
    const ecanvasser = await this.ecanvasserService.findByCampaignId(campaignId)
    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser integration not found')
    }

    const response = await this.ecanvasserApi.fetchFromApi<ApiEcanvasserTeam>(
      '/team',
      ecanvasser.apiKey,
    )

    return response.data
  }
}
