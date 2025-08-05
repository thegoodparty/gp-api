import {
  BadGatewayException,
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { lastValueFrom } from 'rxjs'
import { PeerlyAuthenticationService } from './peerlyAuthentication.service'
import { PeerlyBaseConfig } from '../config/peerlyBaseConfig'
import { PeerlyConfigService } from '../config/peerlyConfig.service'
import { isAxiosResponse } from '../../shared/util/http.util'
import { format } from '@redtea/format-axios-error'
import { Readable } from 'stream'
import FormData from 'form-data'
import {
  UploadPhoneListResponseDto,
  PhoneListStatusResponseDto,
} from '../schemas/phoneList.schema'

const { PEERLY_HTTP_TIMEOUT = '10000' } = process.env
const PEERLY_HTTP_TIMEOUT_MS = parseInt(PEERLY_HTTP_TIMEOUT, 10)

interface UploadPhoneListParams {
  listName: string
  csvStream: Readable
  identityId?: string
  fileSize?: number
}

@Injectable()
export class PhoneListService extends PeerlyBaseConfig {
  private readonly logger: Logger = new Logger(PhoneListService.name)

  constructor(
    private readonly httpService: HttpService,
    private readonly peerlyAuth: PeerlyAuthenticationService,
    private readonly peerlyConfig: PeerlyConfigService,
  ) {
    super()
  }

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
      timeout: PEERLY_HTTP_TIMEOUT_MS,
    }
  }

  private validateUploadResponse(data: unknown): UploadPhoneListResponseDto {
    try {
      return UploadPhoneListResponseDto.create(data)
    } catch (error) {
      this.logger.error('Upload response validation failed:', error)
      throw new BadGatewayException('Invalid upload response from Peerly API')
    }
  }

  private validateStatusResponse(data: unknown): PhoneListStatusResponseDto {
    try {
      return PhoneListStatusResponseDto.create(data)
    } catch (error) {
      this.logger.error('Status response validation failed:', error)
      throw new BadGatewayException('Invalid status response from Peerly API')
    }
  }

  async uploadPhoneList(params: UploadPhoneListParams): Promise<string> {
    const { listName, csvStream, identityId, fileSize } = params
    const { suppressCellPhones, maxFileSize } = this.peerlyConfig.p2pDefaults

    // Validate file size if provided
    if (fileSize && fileSize > maxFileSize) {
      throw new BadRequestException(
        `File size exceeds maximum allowed size of ${maxFileSize} bytes`,
      )
    }

    const form = new FormData()
    form.append('account', this.accountNumber)
    if (identityId) form.append('identity_id', identityId)
    form.append('list_name', listName)
    form.append('suppress_cell_phones', suppressCellPhones.toString())
    form.append(
      'split_timezones',
      this.peerlyConfig.p2pDefaults.splitTimezones.toString(),
    )
    form.append(
      'use_nat_dnc',
      this.peerlyConfig.p2pDefaults.useNatDnc.toString(),
    )

    // For P2P, we don't need opt-in parameters
    form.append('file', csvStream, {
      filename: 'voters.csv',
      contentType: 'text/csv',
    })

    try {
      const headers = {
        ...(await this.peerlyAuth.getAuthorizationHeader()),
        ...form.getHeaders(),
      }
      const response = await lastValueFrom(
        this.httpService.post(`${this.baseUrl}/api/phonelists`, form, {
          headers,
          timeout: PEERLY_HTTP_TIMEOUT_MS,
          maxBodyLength: maxFileSize,
          maxContentLength: maxFileSize,
        }),
      )

      const validated = this.validateUploadResponse(response.data)
      return validated.token
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
          `${this.baseUrl}/api/phonelists/${token}/checkstatus`,
          config,
        ),
      )

      return this.validateStatusResponse(response.data)
    } catch (error) {
      this.handleApiError(error)
    }
  }
}
