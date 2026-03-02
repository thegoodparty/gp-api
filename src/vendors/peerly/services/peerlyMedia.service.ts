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
import { Readable } from 'stream'
import FormData from 'form-data'
import { CreateMediaResponseDto } from '../schemas/peerlyMedia.schema'
import { MediaStatus } from '../peerly.types'
import { MimeTypes } from 'http-constants-ts'
import { PinoLogger } from 'nestjs-pino'

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
    protected readonly logger: PinoLogger,
    private readonly httpService: HttpService,
    private readonly peerlyAuth: PeerlyAuthenticationService,
  ) {
    super(logger)
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  private handleApiError(error: unknown): never {
    this.logger.error(
      { data: isAxiosResponse(error) ? format(error) : error },
      'Failed to communicate with Peerly API',
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
        this.logger.error({ errorMessage }, 'Media creation failed:')
        throw new BadGatewayException(`Media creation failed: ${errorMessage}`)
      }

      this.logger.debug(validatedData, 'Successfully created media')
      return validatedData.media_id
    } catch (error) {
      this.handleApiError(error)
    }
  }
}
