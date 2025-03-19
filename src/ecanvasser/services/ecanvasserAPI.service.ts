import { HttpService } from '@nestjs/axios'
import { Injectable, Logger, BadGatewayException } from '@nestjs/common'
import { lastValueFrom } from 'rxjs'
import { ApiResponse, PaginationParams } from '../ecanvasser.types'
import { Methods } from 'http-constants-ts'

const DEFAULT_PAGE_SIZE = 1000

@Injectable()
export class EcanvasserApiService {
  private readonly apiBaseUrl = 'https://public-api.ecanvasser.com'
  private readonly logger = new Logger(EcanvasserApiService.name)

  constructor(private readonly httpService: HttpService) {}

  async fetchFromApi<T>(
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
