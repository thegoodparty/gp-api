import { Injectable, BadGatewayException, Logger } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { lastValueFrom } from 'rxjs'
import { ListContactsDTO } from './schemas/listContacts.schema'

const { PEOPLE_API_URL } = process.env

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name)

  constructor(private readonly httpService: HttpService) {}

  async findContacts(dto: ListContactsDTO) {
    if (!PEOPLE_API_URL) {
      throw new BadGatewayException(
        'PEOPLE_API_URL environment variable not configured',
      )
    }

    const { state, districtType, districtName, resultsPerPage, page } = dto

    const params = new URLSearchParams({
      state,
      districtType,
      districtName,
      resultsPerPage: resultsPerPage.toString(),
      page: page.toString(),
    })

    try {
      const response = await lastValueFrom(
        this.httpService.get(
          `${PEOPLE_API_URL}/v1/people/list?${params.toString()}`,
        ),
      )
      return response.data
    } catch (error) {
      this.logger.error('Failed to fetch contacts from people API', error)
      throw new BadGatewayException('Failed to fetch contacts from people API')
    }
  }
}
