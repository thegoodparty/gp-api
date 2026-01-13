import { HttpService } from '@nestjs/axios'
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common'
import { format } from '@redtea/format-axios-error'
import FormData from 'form-data'
import { MimeTypes } from 'http-constants-ts'
import { lastValueFrom } from 'rxjs'
import { Readable } from 'stream'
import { isAxiosResponse } from '../../../shared/util/http.util'
import { PeerlyBaseConfig } from '../config/peerlyBaseConfig'
import { MediaStatus } from '../peerly.types'
import { CreateMediaResponseDto } from '../schemas/peerlyMedia.schema'
import { PeerlyAuthenticationService } from './peerlyAuthentication.service'

const MAX_FILE_SIZE = 512000 // 500KB

const ALLOWED_MEDIA_TYPES = [
  MimeTypes.IMAGE_JPEG,
  MimeTypes.IMAGE_PNG,
  MimeTypes.IMAGE_GIF,
]

interface CreateMediaParams {
  identityId: string
  fileStream: Readable | Buffer
  fileName: string
  mimeType: string
  fileSize?: number
  title?: string
}

@Injectable()
export class PeerlyMediaService extends PeerlyBaseConfig {
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

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  private validateCreateResponse(data: unknown): CreateMediaResponseDto {
    return this.validateData(data, CreateMediaResponseDto, 'create media')
  }

  async createMedia(params: CreateMediaParams): Promise<string> {
    const { identityId, fileStream, fileName, mimeType, fileSize, title } =
      params

    if (!ALLOWED_MEDIA_TYPES.includes(mimeType)) {
      throw new BadRequestException(
        `Invalid media type: ${mimeType}. Allowed types: ${ALLOWED_MEDIA_TYPES.join(', ')}`,
      )
    }

    if (fileSize && fileSize > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File size exceeds maximum allowed size of ${MAX_FILE_SIZE} bytes`,
      )
    }

    const form = new FormData()
    form.append('account_id', this.accountNumber)
    form.append('identity_id', identityId)
    if (title) {
      form.append('title', title)
    }
    form.append('initial_file_upload', fileStream, {
      filename: fileName,
      contentType: mimeType,
      knownLength: fileStream instanceof Buffer ? fileStream.length : undefined,
    })

    try {
      const headers = {
        ...(await this.peerlyAuth.getAuthorizationHeader()),
        ...form.getHeaders(),
      }
      const response = await lastValueFrom(
        this.httpService.post(`${this.baseUrl}/v2/media`, form, {
          headers,
          timeout: this.httpTimeoutMs,
          maxBodyLength: MAX_FILE_SIZE,
          maxContentLength: MAX_FILE_SIZE,
        }),
      )
      const { data } = response as {
        data: Record<string, string | number | boolean>
      }
      const validatedData = this.validateCreateResponse(data)

      if (validatedData.status === MediaStatus.ERROR) {
        const errorMessage = validatedData.error || 'Media creation failed'
        this.logger.error('Media creation failed:', errorMessage)
        throw new BadGatewayException(`Media creation failed: ${errorMessage}`)
      }

      this.logger.debug('Successfully created media', validatedData)
      return validatedData.media_id
    } catch (error) {
      this.handleApiError(error)
    }
  }
}
