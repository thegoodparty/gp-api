import { Injectable, NotFoundException } from '@nestjs/common'
import { EcanvasserIntegrationService } from './ecanvasserIntegration.service'
import { CreateSurveySchema } from '../schemas/createSurvey.schema'
import { CreateSurveyQuestionSchema } from '../schemas/createSurveyQuestion.schema'
import { UpdateSurveyQuestionSchema } from '../schemas/updateSurveyQuestion.schema'
import { UpdateSurveySchema } from '../schemas/updateSurvey.schema'
import {
  ApiEcanvasserSurvey,
  ApiEcanvasserSurveyQuestion,
} from '../ecanvasserIntegration.types'
import { EcanvasserService } from './ecanvasser.service'

@Injectable()
export class SurveyService {
  constructor(
    private readonly ecanvasserIntegrationService: EcanvasserIntegrationService,
    private readonly ecanvasser: EcanvasserService,
  ) {}

  async createSurvey(campaignId: number, createSurveyDto: CreateSurveySchema) {
    const ecanvasser =
      await this.ecanvasserIntegrationService.findByCampaignId(campaignId)
    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser record not found')
    }

    return this.ecanvasser.createSurvey(ecanvasser.apiKey, {
      name: createSurveyDto.name,
      description: createSurveyDto.description,
      requires_signature: createSurveyDto.requiresSignature,
      status: createSurveyDto.status,
      team_id: createSurveyDto.teamId,
    } as ApiEcanvasserSurvey)
  }

  async findSurveys(campaignId: number) {
    const ecanvasser =
      await this.ecanvasserIntegrationService.findByCampaignId(campaignId)
    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser record not found')
    }

    return this.ecanvasser.findSurveys(ecanvasser.apiKey)
  }

  async findSurvey(campaignId: number, surveyId: number) {
    const ecanvasser =
      await this.ecanvasserIntegrationService.findByCampaignId(campaignId)
    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser record not found')
    }

    return this.ecanvasser.findSurvey(surveyId, ecanvasser.apiKey)
  }

  async updateSurvey(
    campaignId: number,
    surveyId: number,
    updateSurveyDto: UpdateSurveySchema,
  ) {
    const ecanvasser =
      await this.ecanvasserIntegrationService.findByCampaignId(campaignId)
    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser record not found')
    }

    return this.ecanvasser.updateSurvey(
      surveyId,
      updateSurveyDto,
      ecanvasser.apiKey,
    )
  }

  async deleteSurvey(campaignId: number, surveyId: number) {
    const ecanvasser =
      await this.ecanvasserIntegrationService.findByCampaignId(campaignId)
    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser record not found')
    }

    return this.ecanvasser.deleteSurvey(surveyId, ecanvasser.apiKey)
  }

  async createSurveyQuestion(
    campaignId: number,
    surveyId: number,
    createQuestionDto: CreateSurveyQuestionSchema,
  ) {
    const ecanvasser =
      await this.ecanvasserIntegrationService.findByCampaignId(campaignId)
    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser record not found')
    }

    return this.ecanvasser.createSurveyQuestion(
      {
        survey_id: surveyId,
        name: createQuestionDto.name,
        order: createQuestionDto.order,
        required: createQuestionDto.required,
        answer_type: {
          id: createQuestionDto.answerFormatId,
          name: createQuestionDto.answerFormatName,
        },
        answers: createQuestionDto.answers || undefined,
      } as ApiEcanvasserSurveyQuestion,
      ecanvasser.apiKey,
    )
  }

  async findSurveyQuestion(campaignId: number, questionId: number) {
    const ecanvasser =
      await this.ecanvasserIntegrationService.findByCampaignId(campaignId)
    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser record not found')
    }

    return this.ecanvasser.findSurveyQuestion(questionId, ecanvasser.apiKey)
  }

  async updateSurveyQuestion(
    campaignId: number,
    questionId: number,
    updateQuestionDto: UpdateSurveyQuestionSchema,
  ) {
    const ecanvasser =
      await this.ecanvasserIntegrationService.findByCampaignId(campaignId)
    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser record not found')
    }

    return this.ecanvasser.updateSurveyQuestion(
      questionId,
      updateQuestionDto,
      ecanvasser.apiKey,
    )
  }

  async deleteSurveyQuestion(campaignId: number, questionId: number) {
    const ecanvasser =
      await this.ecanvasserIntegrationService.findByCampaignId(campaignId)
    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser record not found')
    }

    return this.ecanvasser.deleteSurveyQuestion(questionId, ecanvasser.apiKey)
  }

  async findTeams(campaignId: number) {
    const ecanvasser =
      await this.ecanvasserIntegrationService.findByCampaignId(campaignId)
    if (!ecanvasser) {
      throw new NotFoundException('Ecanvasser record not found')
    }

    return this.ecanvasser.findTeams(ecanvasser.apiKey)
  }
}
