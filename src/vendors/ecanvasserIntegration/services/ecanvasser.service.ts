// documentation https://public-api.ecanvasser.com/

import { HttpService } from '@nestjs/axios'
import { BadGatewayException, Injectable, Logger } from '@nestjs/common'
import { AxiosResponse } from 'axios'
import { Methods } from 'http-constants-ts'
import { lastValueFrom } from 'rxjs'
import {
  ApiEcanvasserContact,
  ApiEcanvasserHouse,
  ApiEcanvasserInteraction,
  ApiEcanvasserSurvey,
  ApiEcanvasserSurveyQuestion,
  ApiEcanvasserTeam,
  ApiResponse,
  PaginationParams,
} from '../ecanvasserIntegration.types'
import { UpdateSurveySchema } from '../schemas/updateSurvey.schema'
import { UpdateSurveyQuestionSchema } from '../schemas/updateSurveyQuestion.schema'

const DEFAULT_PAGE_SIZE = 1000

@Injectable()
export class EcanvasserService {
  private readonly apiBaseUrl = 'https://public-api.ecanvasser.com'
  private readonly logger = new Logger(EcanvasserService.name)

  constructor(private readonly httpService: HttpService) {}

  async createSurvey(apiKey: string, survey: ApiEcanvasserSurvey) {
    try {
      const response = await this.fetchFromApi<ApiEcanvasserSurvey>(
        '/survey',
        apiKey,
        {
          method: Methods.POST,
          data: survey,
        },
      )

      return response.data
    } catch (error) {
      this.logger.error('Failed to create survey', error)
      throw new BadGatewayException('Failed to create survey in Ecanvasser')
    }
  }

  async findSurveys(apiKey: string) {
    const response = await this.fetchFromApi<ApiEcanvasserSurvey>(
      '/survey',
      apiKey,
    )

    return response.data
  }

  async findSurvey(surveyId: number, apiKey: string) {
    const { data } = await this.fetchFromApi<ApiEcanvasserSurvey>(
      `/survey/${surveyId}`,
      apiKey,
    )

    return data
  }

  async updateSurvey(
    surveyId: number,
    survey: UpdateSurveySchema,
    apiKey: string,
  ) {
    const response = await this.fetchFromApi<ApiEcanvasserSurvey>(
      `/survey/${surveyId}`,
      apiKey,
      {
        method: Methods.PUT,
        data: survey,
      },
    )

    return response.data
  }

  async deleteSurvey(surveyId: number, apiKey: string) {
    const response = await this.fetchFromApi(`/survey/${surveyId}`, apiKey, {
      method: Methods.DELETE,
    })

    return response.data
  }

  async createSurveyQuestion(
    surveyQuestion: ApiEcanvasserSurveyQuestion,
    apiKey: string,
  ) {
    const response = await this.fetchFromApi<ApiEcanvasserSurveyQuestion>(
      '/survey/question',
      apiKey,
      {
        method: Methods.POST,
        data: surveyQuestion,
      },
    )

    return response.data
  }

  async findSurveyQuestion(questionId: number, apiKey: string) {
    const { data } = await this.fetchFromApi<ApiEcanvasserSurveyQuestion>(
      `/survey/question/${questionId}`,
      apiKey,
    )

    return data
  }

  async updateSurveyQuestion(
    questionId: number,
    surveyQuestion: UpdateSurveyQuestionSchema,
    apiKey: string,
  ) {
    const { data } = await this.fetchFromApi<ApiEcanvasserSurveyQuestion>(
      `/survey/question/${questionId}`,
      apiKey,
      {
        method: Methods.PUT,
        data: surveyQuestion,
      },
    )

    return data
  }

  async deleteSurveyQuestion(questionId: number, apiKey: string) {
    const { data } = await this.fetchFromApi(
      `/survey/question/${questionId}`,
      apiKey,
      {
        method: Methods.DELETE,
      },
    )

    return data
  }

  async findTeams(apiKey: string) {
    const { data } = await this.fetchFromApi<ApiEcanvasserTeam>('/team', apiKey)

    return data
  }

  async fetchContacts(apiKey: string, startDate?: Date) {
    return await this.fetchAllPages<ApiEcanvasserContact>(
      '/contact',
      apiKey,
      startDate,
    )
  }

  async fetchHouses(apiKey: string, startDate?: Date) {
    return await this.fetchAllPages<ApiEcanvasserHouse>(
      '/house',
      apiKey,
      startDate,
    )
  }

  async fetchInteractions(apiKey: string, startDate?: Date) {
    return await this.fetchAllPages<ApiEcanvasserInteraction>(
      '/interaction',
      apiKey,
      startDate,
    )
  }

  private async fetchFromApi<T>(
    endpoint: string,
    apiKey: string,
    options: {
      method?: Methods
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data?: any
      params?: PaginationParams
    } = {},
  ): Promise<ApiResponse<T>> {
    try {
      const {
        method = Methods.GET,
        data,
        params = {},
      } = options as {
        method?: Methods
        data?: Record<string, string | number | boolean>
        params?: Record<string, string | number | boolean>
      }
      const queryParams = new URLSearchParams()

      if (params.limit) {
        queryParams.append('limit', params.limit.toString())
      }
      if (params.order) {
        queryParams.append('order', String(params.order))
      }
      if (params.after_id) {
        queryParams.append('after_id', params.after_id.toString())
      }
      if (params.before_id) {
        queryParams.append('before_id', params.before_id.toString())
      }
      if (params.start_date) {
        queryParams.append('start_date', String(params.start_date))
      }

      const url = `${this.apiBaseUrl}${endpoint}${
        queryParams.toString() ? `?${queryParams.toString()}` : ''
      }`

      const config = {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }

      let response: AxiosResponse<T>
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

  async fetchAllPages<T>(
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

  private async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }
}
