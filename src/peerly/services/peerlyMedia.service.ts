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
import { isAxiosResponse } from '../../shared/util/http.util'
import { format } from '@redtea/format-axios-error'
import { Readable } from 'stream'
import FormData from 'form-data'
import { CreateMediaResponseDto } from '../schemas/peerlyMedia.schema'
import { MimeTypes } from 'http-constants-ts'

const PEERLY_HTTP_TIMEOUT_MS = 15 * 1000 // 10 second timeout

const MAX_FILE_SIZE = 512000 // 500KB

const ALLOWED_MEDIA_TYPES = [
  MimeTypes.IMAGE_JPEG,
  MimeTypes.IMAGE_PNG,
  MimeTypes.IMAGE_GIF,
]

interface CreateMediaParams {
  identityId: string
  fileStream: Readable
  fileName: string
  mimeType: string
  fileSize?: number
}

@Injectable()
export class PeerlyMediaService extends PeerlyBaseConfig {
  private readonly logger: Logger = new Logger(PeerlyMediaService.name)

  constructor(
    private readonly httpService: HttpService,
    private readonly peerlyAuth: PeerlyAuthenticationService,
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

    // Validate mime type
    if (!ALLOWED_MEDIA_TYPES.includes(mimeType)) {
      throw new BadRequestException(
        `Invalid media type: ${mimeType}. Allowed types: ${ALLOWED_MEDIA_TYPES.join(', ')}`,
      )
    }

    // Validate file size if provided
    if (fileSize && fileSize > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File size exceeds maximum allowed size of ${MAX_FILE_SIZE} bytes`,
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
          maxBodyLength: MAX_FILE_SIZE,
          maxContentLength: MAX_FILE_SIZE,
        }),
      )
      const { data } = response
      const validatedData = this.validateCreateResponse(data)
      this.logger.debug('Successfully created media', validatedData)
      return validatedData.media_id
    } catch (error) {
      this.handleApiError(error)
    }
  }
}
