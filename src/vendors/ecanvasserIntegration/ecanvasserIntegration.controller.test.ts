import { Campaign } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EcanvasserIntegrationController } from './ecanvasserIntegration.controller'
import { EcanvasserIntegrationService } from './services/ecanvasserIntegration.service'
import { SurveyService } from './services/survey.service'
import { CreateEcanvasserSchema } from './schemas/createEcanvasser.schema'
import { UpdateEcanvasserSchema } from './schemas/updateEcanvasser.schema'
import { CreateSurveySchema } from './schemas/createSurvey.schema'
import { UpdateSurveySchema } from './schemas/updateSurvey.schema'
import { CreateSurveyQuestionSchema } from './schemas/createSurveyQuestion.schema'
import { UpdateSurveyQuestionSchema } from './schemas/updateSurveyQuestion.schema'

describe('EcanvasserIntegrationController', () => {
  let controller: EcanvasserIntegrationController
  let ecanvasserService: EcanvasserIntegrationService
  let surveyService: SurveyService

  const mockCampaign = { id: 1 } as Campaign

  beforeEach(() => {
    ecanvasserService = {
      create: vi.fn(),
      mine: vi.fn(),
      summary: vi.fn(),
      findByCampaignId: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      sync: vi.fn(),
      findAll: vi.fn(),
      syncAll: vi.fn(),
    } as unknown as EcanvasserIntegrationService

    surveyService = {
      createSurvey: vi.fn(),
      findSurveys: vi.fn(),
      findSurvey: vi.fn(),
      updateSurvey: vi.fn(),
      deleteSurvey: vi.fn(),
      createSurveyQuestion: vi.fn(),
      findTeams: vi.fn(),
      deleteSurveyQuestion: vi.fn(),
      findSurveyQuestion: vi.fn(),
      updateSurveyQuestion: vi.fn(),
    } as unknown as SurveyService

    controller = new EcanvasserIntegrationController(
      ecanvasserService,
      surveyService,
    )
    vi.clearAllMocks()
  })

  describe('create', () => {
    it('calls ecanvasserService.create with the dto', () => {
      const dto = {
        apiKey: 'test-key',
        email: 'test@example.com',
      } as CreateEcanvasserSchema

      controller.create(dto)

      expect(ecanvasserService.create).toHaveBeenCalledWith(dto)
    })
  })

  describe('findMine', () => {
    it('calls ecanvasserService.mine with campaign id', async () => {
      await controller.findMine(mockCampaign)

      expect(ecanvasserService.mine).toHaveBeenCalledWith(1)
    })
  })

  describe('findMineSummary', () => {
    it('calls ecanvasserService.summary with campaign id', async () => {
      await controller.findMineSummary(mockCampaign)

      expect(ecanvasserService.summary).toHaveBeenCalledWith(1)
    })
  })

  describe('findOne', () => {
    it('calls ecanvasserService.findByCampaignId with campaignId', () => {
      controller.findOne(5)

      expect(ecanvasserService.findByCampaignId).toHaveBeenCalledWith(5)
    })
  })

  describe('update', () => {
    it('calls ecanvasserService.update with campaignId and dto', () => {
      const dto = { apiKey: 'new-key' } as UpdateEcanvasserSchema

      controller.update(5, dto)

      expect(ecanvasserService.update).toHaveBeenCalledWith(5, dto)
    })
  })

  describe('remove', () => {
    it('calls ecanvasserService.remove with campaignId', () => {
      controller.remove(5)

      expect(ecanvasserService.remove).toHaveBeenCalledWith(5)
    })
  })

  describe('sync', () => {
    it('calls ecanvasserService.sync with force=true when body.force is true', () => {
      controller.sync(5, { force: true })

      expect(ecanvasserService.sync).toHaveBeenCalledWith(5, true)
    })

    it('calls ecanvasserService.sync with force=false when body.force is not true', () => {
      controller.sync(5, {})

      expect(ecanvasserService.sync).toHaveBeenCalledWith(5, false)
    })
  })

  describe('findAll', () => {
    it('calls ecanvasserService.findAll', () => {
      controller.findAll()

      expect(ecanvasserService.findAll).toHaveBeenCalled()
    })
  })

  describe('syncAll', () => {
    it('calls ecanvasserService.syncAll', () => {
      controller.syncAll()

      expect(ecanvasserService.syncAll).toHaveBeenCalled()
    })
  })

  describe('createSurvey', () => {
    it('calls surveyService.createSurvey with campaign id and dto', () => {
      const dto = {
        name: 'Test Survey',
        description: 'A test survey',
      } as CreateSurveySchema

      controller.createSurvey(mockCampaign, dto)

      expect(surveyService.createSurvey).toHaveBeenCalledWith(1, dto)
    })
  })

  describe('findSurveys', () => {
    it('calls surveyService.findSurveys with campaign id', () => {
      controller.findSurveys(mockCampaign)

      expect(surveyService.findSurveys).toHaveBeenCalledWith(1)
    })
  })

  describe('findSurvey', () => {
    it('calls surveyService.findSurvey with campaign id and survey id', () => {
      controller.findSurvey(mockCampaign, 10)

      expect(surveyService.findSurvey).toHaveBeenCalledWith(1, 10)
    })
  })

  describe('updateSurvey', () => {
    it('calls surveyService.updateSurvey with campaign id, survey id, and dto', () => {
      const dto = {
        name: 'Updated',
        status: 'Live',
      } as UpdateSurveySchema

      controller.updateSurvey(mockCampaign, 10, dto)

      expect(surveyService.updateSurvey).toHaveBeenCalledWith(1, 10, dto)
    })
  })

  describe('deleteSurvey', () => {
    it('calls surveyService.deleteSurvey with campaign id and survey id', () => {
      controller.deleteSurvey(mockCampaign, 10)

      expect(surveyService.deleteSurvey).toHaveBeenCalledWith(1, 10)
    })
  })

  describe('createSurveyQuestion', () => {
    it('calls surveyService.createSurveyQuestion with campaign id, survey id, and dto', () => {
      const dto = {
        name: 'Test Question',
        surveyId: 10,
        answerFormatId: 1,
      } as CreateSurveyQuestionSchema

      controller.createSurveyQuestion(mockCampaign, 10, dto)

      expect(surveyService.createSurveyQuestion).toHaveBeenCalledWith(
        1,
        10,
        dto,
      )
    })
  })

  describe('findTeams', () => {
    it('calls surveyService.findTeams with campaign id', () => {
      controller.findTeams(mockCampaign)

      expect(surveyService.findTeams).toHaveBeenCalledWith(1)
    })
  })

  describe('deleteSurveyQuestion', () => {
    it('calls surveyService.deleteSurveyQuestion with campaign id and question id', () => {
      controller.deleteSurveyQuestion(mockCampaign, 20)

      expect(surveyService.deleteSurveyQuestion).toHaveBeenCalledWith(1, 20)
    })
  })

  describe('findSurveyQuestion', () => {
    it('calls surveyService.findSurveyQuestion with campaign id and question id', () => {
      controller.findSurveyQuestion(mockCampaign, 20)

      expect(surveyService.findSurveyQuestion).toHaveBeenCalledWith(1, 20)
    })
  })

  describe('updateSurveyQuestion', () => {
    it('calls surveyService.updateSurveyQuestion with campaign id, question id, and dto', () => {
      const dto = {
        name: 'Updated Question',
        surveyId: 10,
      } as UpdateSurveyQuestionSchema

      controller.updateSurveyQuestion(mockCampaign, 20, dto)

      expect(surveyService.updateSurveyQuestion).toHaveBeenCalledWith(
        1,
        20,
        dto,
      )
    })
  })
})
