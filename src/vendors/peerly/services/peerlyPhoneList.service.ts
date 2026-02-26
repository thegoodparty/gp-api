import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { lastValueFrom } from 'rxjs'
import { PeerlyAuthenticationService } from './peerlyAuthentication.service'
import { PeerlyBaseConfig } from '../config/peerlyBaseConfig'
import { isAxiosResponse } from '../../../shared/util/http.util'
import { format } from '@redtea/format-axios-error'
import FormData from 'form-data'
import {
  PhoneListDetailsResponseDto,
  PhoneListStatusResponseDto,
  UploadPhoneListResponseDto,
} from '../schemas/peerlyPhoneList.schema'
import {
  P2P_DNC_SCRUBBING,
  P2P_DNC_SUPPRESS_INITIALS,
  P2P_PHONE_LIST_MAP,
} from '../constants/p2pJob.constants'

const P2P_SUPPRESS_CELL_PHONES = '4' // Suppress landline phones
const MAX_FILE_SIZE = 104857600 // 100MB

interface UploadPhoneListParams {
  listName: string
  csvBuffer: Buffer
  identityId?: string
  fileSize?: number
}

@Injectable()
export class PeerlyPhoneListService extends PeerlyBaseConfig {
  constructor(
    private readonly httpService: HttpService,
    private readonly peerlyAuth: PeerlyAuthenticationService,
  ) {
    super()
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  private handleApiError(error: unknown): never {
    this.logger.error(
      { data: isAxiosResponse(error) ? format(error) : error },
      'Failed to communicate with Peerly API',
    )
    throw new BadGatewayException('Failed to communicate with Peerly API')
  }

  private async getBaseHttpHeaders() {
    return {
      headers: await this.peerlyAuth.getAuthorizationHeader(),
      timeout: this.httpTimeoutMs,
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  private validateUploadResponse(data: unknown): UploadPhoneListResponseDto {
    return this.validateData(data, UploadPhoneListResponseDto, 'upload')
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  private validateStatusResponse(data: unknown): PhoneListStatusResponseDto {
    return this.validateData(data, PhoneListStatusResponseDto, 'status')
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  private validateDetailsResponse(data: unknown): PhoneListDetailsResponseDto {
    return this.validateData(data, PhoneListDetailsResponseDto, 'details')
  }

  async uploadPhoneList(params: UploadPhoneListParams): Promise<string> {
    const { listName, csvBuffer, identityId, fileSize } = params

    const actualFileSize = fileSize || csvBuffer.length
    if (actualFileSize > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File size exceeds maximum allowed size of ${MAX_FILE_SIZE} bytes`,
      )
    }

    const formFields = {
      account: this.accountNumber,
      ...(identityId && { identity_id: identityId }),
      list_name: listName,
      suppress_cell_phones: P2P_SUPPRESS_CELL_PHONES,
      list_map: JSON.stringify(P2P_PHONE_LIST_MAP),
      use_nat_dnc: P2P_DNC_SCRUBBING,
      dnc_suppress_initials: P2P_DNC_SUPPRESS_INITIALS,
    }

    const form = new FormData()
    Object.entries(formFields).forEach(([key, value]) => {
      form.append(key, value)
    })

    form.append('file', csvBuffer, {
      filename: 'voters.csv',
      contentType: 'text/csv',
    })

    try {
      const headers = {
        ...(await this.peerlyAuth.getAuthorizationHeader()),
        ...form.getHeaders(),
      }
      const response = await lastValueFrom(
        this.httpService.post(`${this.baseUrl}/phonelists`, form, {
          headers,
          timeout: this.uploadTimeoutMs,
          maxBodyLength: MAX_FILE_SIZE,
          maxContentLength: MAX_FILE_SIZE,
        }),
      )

      const validated = this.validateUploadResponse(response.data)
      return validated.Data.token
    } catch (error) {
      this.handleApiError(error)
    }
  }

  async checkPhoneListStatus(
    token: string,
  ): Promise<PhoneListStatusResponseDto> {
    try {
      const config = await this.getBaseHttpHeaders()
      const response = await lastValueFrom(
        this.httpService.get(
          `${this.baseUrl}/phonelists/${token}/checkstatus`,
          config,
        ),
      )

      return this.validateStatusResponse(response.data)
    } catch (error) {
      this.handleApiError(error)
    }
  }

  async getPhoneListDetails(
    listId: number,
  ): Promise<PhoneListDetailsResponseDto> {
    try {
      const config = await this.getBaseHttpHeaders()
      const response = await lastValueFrom(
        this.httpService.get(`${this.baseUrl}/phonelists/${listId}`, config),
      )

      return this.validateDetailsResponse(response.data)
    } catch (error) {
      this.handleApiError(error)
    }
  }
}
