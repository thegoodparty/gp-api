import { HttpStatus, Injectable } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { Headers, MimeTypes } from 'http-constants-ts'
import { CreateUserInputDto } from '../../users/schemas/CreateUserInput.schema'
import { lastValueFrom, Observable } from 'rxjs'
import axios, { AxiosResponse } from 'axios'
import { Campaign, User } from '@prisma/client'
import { IS_DEV } from '../../shared/util/appEnvironment.util'
import { UsersService } from '../../users/users.service'

const { CONTENT_TYPE, AUTHORIZATION } = Headers
const { APPLICATION_JSON } = MimeTypes

const { FULLSTORY_API_KEY } = process.env

const FULLSTORY_ROOT_USERS_URL = 'https://org.fullstory.com/api/v2/users'

type FullStoryUserProperties = Partial<CreateUserInputDto>

interface FullStoryUserResponse {
  data: {
    results: {
      id: string
    }[]
  }
}

@Injectable()
export class FullStoryService {
  private readonly axiosConfig = {
    headers: {
      [CONTENT_TYPE]: APPLICATION_JSON,
      [AUTHORIZATION]: `Basic ${FULLSTORY_API_KEY}`,
    },
  }
  constructor(
    private readonly users: UsersService,
    private readonly httpService: HttpService,
  ) {}

  private readonly disabled = !FULLSTORY_API_KEY || IS_DEV

  async getFullStoryUserId({ id: userId, firstName, lastName }: User) {
    if (this.disabled) {
      return
    }
    try {
      const response = await lastValueFrom(
        this.httpService.get(
          `${FULLSTORY_ROOT_USERS_URL}?uid=${userId}`,
          this.axiosConfig,
        ) as Observable<FullStoryUserResponse>,
      )

      if (response.data?.results?.length === 1) {
        return response.data.results[0].id
      }
    } catch (error) {
      if (
        axios.isAxiosError(error) &&
        (error.response as AxiosResponse) &&
        error.response?.status === HttpStatus.NOT_FOUND
      ) {
        // Tracking for the given user doesn't exist, create it
        const createResponse = await lastValueFrom(
          this.httpService.post(
            FULLSTORY_ROOT_USERS_URL,
            {
              uid: `${userId}`,
              display_name: `${firstName} ${lastName}`, // Customize this as needed
            },
            this.axiosConfig,
          ),
        )
        const fsUserId = createResponse.data.id
        await this.users.patchUserMetaData(userId, { fsUserId })
        return fsUserId
      } else {
        throw error
      }
    }
  }

  async trackUser({ user, campaign }: TrackUserArgs) {
    if (this.disabled) {
      return
    }
    const fullStoryUserId = await this.getFullStoryUserId(user)
    const properties = {}
    return this.httpService.post(
      `${FULLSTORY_ROOT_USERS_URL}/${fullStoryUserId}`,
      { properties },
      this.axiosConfig,
    )
  }
}

interface TrackUserArgs {
  user: User
  campaign?: Campaign
  // TODO: need to add CRM company data here once HubSpot integration is complete
  // crmCompany?: CrmCompany
}
