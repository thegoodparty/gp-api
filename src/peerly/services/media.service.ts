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
import { CreateMediaResponseDto } from '../schemas/media.schema'

const { PEERLY_HTTP_TIMEOUT = '10000' } = process.env
const PEERLY_HTTP_TIMEOUT_MS = parseInt(PEERLY_HTTP_TIMEOUT, 10)

const ALLOWED_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'video/mp4',
]

interface CreateMediaParams {
  identityId: string
  fileStream: Readable
  fileName: string
  mimeType: string
  fileSize?: number
}

@Injectable()
export class MediaService extends PeerlyBaseConfig {
  private readonly logger: Logger = new Logger(MediaService.name)

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

  private validateCreateResponse(data: unknown): CreateMediaResponseDto {
    try {
      return CreateMediaResponseDto.create(data)
    } catch (error) {
      this.logger.error('Create media response validation failed:', error)
      throw new BadGatewayException(
        'Invalid create media response from Peerly API',
      )
    }
  }

  async createMedia(params: CreateMediaParams): Promise<string> {
    const { identityId, fileStream, fileName, mimeType, fileSize } = params
    const { maxFileSize } = this.peerlyConfig.p2pDefaults

    // Validate mime type
    if (!ALLOWED_MEDIA_TYPES.includes(mimeType)) {
      throw new BadRequestException(
        `Invalid media type: ${mimeType}. Allowed types: ${ALLOWED_MEDIA_TYPES.join(', ')}`,
      )
    }

    // Validate file size if provided
    if (fileSize && fileSize > maxFileSize) {
      throw new BadRequestException(
        `File size exceeds maximum allowed size of ${maxFileSize} bytes`,
      )
    }

    const form = new FormData()
    form.append('account_id', this.accountNumber)
    form.append('identity_id', identityId)
    form.append('initial_file_upload', fileStream, {
      filename: fileName,
      contentType: mimeType,
    })

    try {
      const headers = {
        ...(await this.peerlyAuth.getAuthorizationHeader()),
        ...form.getHeaders(),
      }
      const response = await lastValueFrom(
        this.httpService.post(`${this.baseUrl}/api/v2/media`, form, {
          headers,
          timeout: PEERLY_HTTP_TIMEOUT_MS,
          maxBodyLength: maxFileSize,
          maxContentLength: maxFileSize,
        }),
      )

      const validated = this.validateCreateResponse(response.data)

      if (validated.status === 'ERROR') {
        throw new BadGatewayException(
          `Media creation failed: ${validated.error}`,
        )
      }

      return validated.media_id
    } catch (error) {
      this.handleApiError(error)
    }
  }
}
