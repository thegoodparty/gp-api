import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { lastValueFrom } from 'rxjs'
import { PeerlyAuthenticationService } from './peerlyAuthentication.service'
import { PeerlyBaseConfig } from '../config/peerlyBaseConfig'
import { isAxiosResponse } from '../../shared/util/http.util'
import { format } from '@redtea/format-axios-error'
import FormData from 'form-data'
import {
  PhoneListDetailsResponseDto,
  PhoneListStatusResponseDto,
  UploadPhoneListResponseDto,
} from '../schemas/peerlyPhoneList.schema'

const P2P_SUPPRESS_CELL_PHONES = '4' // Suppress landline phones
const MAX_FILE_SIZE = 104857600 // 100MB
const PEERLY_UPLOAD_TIMEOUT_MS = 30000 // 30s

interface UploadPhoneListParams {
  listName: string
  csvBuffer: Buffer
  identityId?: string
  fileSize?: number
}

@Injectable()
export class PeerlyPhoneListService extends PeerlyBaseConfig {
  httpTimeoutMs = PEERLY_UPLOAD_TIMEOUT_MS
  constructor(
    private readonly httpService: HttpService,
    private readonly peerlyAuth: PeerlyAuthenticationService,
  ) {
    super()
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  private handleApiError(error: unknown): never {
    this.logger.error(
      'Failed to communicate with Peerly API',
      isAxiosResponse(error) ? format(error) : error,
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

  async uploadPhoneListToken(params: UploadPhoneListParams): Promise<string> {
    const { listName, csvBuffer, identityId, fileSize } = params

    // Validate file size using buffer length
    const actualFileSize = fileSize || csvBuffer.length
    if (actualFileSize > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File size exceeds maximum allowed size of ${MAX_FILE_SIZE} bytes`,
      )
    }

    // Create list mapping for Peerly API based on our CSV column structure
    const listMap = {
      first_name: 1,
      last_name: 2,
      lead_phone: 3,
      state: 4,
      city: 5,
      zip: 6,
    }

    const form = new FormData()
    form.append('account', this.accountNumber)
    if (identityId) form.append('identity_id', identityId)
    form.append('list_name', listName)
    form.append('suppress_cell_phones', P2P_SUPPRESS_CELL_PHONES)
    form.append('list_map', JSON.stringify(listMap))
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
          timeout: this.httpTimeoutMs,
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

  async uploadPhoneList(
    params: UploadPhoneListParams,
  ): Promise<PhoneListStatusResponseDto> {
    const token = await this.uploadPhoneListToken(params)
    return this.checkPhoneListStatus(token)
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
