import { HttpService } from '@nestjs/axios'
import { Injectable } from '@nestjs/common'
import { Headers, MimeTypes } from 'http-constants-ts'
import { firstValueFrom } from 'rxjs'

const API_BASE = 'https://api.ashbyhq.com/jobPosting'
const ASHBY_KEY = process.env.ASHBY_KEY
if (!ASHBY_KEY) {
  throw new Error('Please set ASHBY_KEY in your .env')
}

interface FetchJobsParams {
  listedOnly?: boolean
  jobPostingId?: string
}

@Injectable()
export class JobsService {
  constructor(private readonly httpService: HttpService) {}

  async findAll() {
    return await this.fetchJobs('list', { listedOnly: true })
  }

  async findOne(id: string) {
    return await this.fetchJobs('info', { jobPostingId: id })
  }

  private async fetchJobs(type: string, params?: FetchJobsParams) {
    const url = `${API_BASE}.${type}`
    const response = await firstValueFrom(
      this.httpService.post(url, params, {
        headers: {
          [Headers.CONTENT_TYPE]: MimeTypes.APPLICATION_JSON,
          [Headers.ACCEPT]: MimeTypes.APPLICATION_JSON,
          [Headers.AUTHORIZATION]: `Basic ${Buffer.from(
            ASHBY_KEY + ':',
          ).toString('base64')}`,
        },
      }),
    )
    return response.data.results
  }
}
