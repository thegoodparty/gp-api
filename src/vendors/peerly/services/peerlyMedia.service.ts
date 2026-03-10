import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common'
import { PeerlyBaseConfig } from '../config/peerlyBaseConfig'
import { Readable } from 'stream'
import FormData from 'form-data'
import { CreateMediaResponseDto } from '../schemas/peerlyMedia.schema'
import { MediaStatus } from '../peerly.types'
import { MimeTypes } from 'http-constants-ts'
import { PinoLogger } from 'nestjs-pino'
import { PeerlyErrorHandlingService } from './peerlyErrorHandling.service'
import { PeerlyHttpService } from './peerlyHttp.service'

const MAX_FILE_SIZE = 512000

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
    private readonly peerlyHttpService: PeerlyHttpService,
    private readonly peerlyErrorHandling: PeerlyErrorHandlingService,
  ) {
    super(logger)
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
      const response = await this.peerlyHttpService.post('/v2/media', form, {
        headers: form.getHeaders(),
        timeout: this.httpTimeoutMs,
        maxBodyLength: MAX_FILE_SIZE,
        maxContentLength: MAX_FILE_SIZE,
      })
      const { data } = response as {
        data: Record<string, string | number | boolean>
      }
      const validatedData = this.peerlyHttpService.validateResponse(
        data,
        CreateMediaResponseDto,
        'create media',
      )

      if (validatedData.status === MediaStatus.ERROR) {
        const errorMessage = validatedData.error || 'Media creation failed'
        this.logger.error({ errorMessage }, 'Media creation failed:')
        throw new BadGatewayException(`Media creation failed: ${errorMessage}`)
      }

      this.logger.debug(validatedData, 'Successfully created media')
      return validatedData.media_id
    } catch (error) {
      return this.peerlyErrorHandling.handleApiError({
        error,
        logger: this.logger,
      })
    }
  }
}
