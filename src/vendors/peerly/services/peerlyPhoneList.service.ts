import { BadRequestException, Injectable } from '@nestjs/common'
import { PeerlyBaseConfig } from '../config/peerlyBaseConfig'
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
import { PinoLogger } from 'nestjs-pino'
import { PeerlyErrorHandlingService } from './peerlyErrorHandling.service'
import { PeerlyHttpService } from './peerlyHttp.service'

const P2P_SUPPRESS_CELL_PHONES = '4'
const MAX_FILE_SIZE = 104857600

interface UploadPhoneListParams {
  listName: string
  csvBuffer: Buffer
  identityId?: string
  fileSize?: number
}

@Injectable()
export class PeerlyPhoneListService extends PeerlyBaseConfig {
  constructor(
    protected readonly logger: PinoLogger,
    private readonly peerlyHttpService: PeerlyHttpService,
    private readonly peerlyErrorHandling: PeerlyErrorHandlingService,
  ) {
    super(logger)
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
      const response = await this.peerlyHttpService.post('/phonelists', form, {
        headers: form.getHeaders(),
        timeout: this.uploadTimeoutMs,
        maxBodyLength: MAX_FILE_SIZE,
        maxContentLength: MAX_FILE_SIZE,
      })

      const validated = this.peerlyHttpService.validateResponse(
        response.data,
        UploadPhoneListResponseDto,
        'upload',
      )
      return validated.Data.token
    } catch (error) {
      return this.peerlyErrorHandling.handleApiError({
        error,
        logger: this.logger,
      })
    }
  }

  async checkPhoneListStatus(
    token: string,
  ): Promise<PhoneListStatusResponseDto> {
    try {
      const response = await this.peerlyHttpService.get(
        `/phonelists/${token}/checkstatus`,
      )

      return this.peerlyHttpService.validateResponse(
        response.data,
        PhoneListStatusResponseDto,
        'status',
      )
    } catch (error) {
      return this.peerlyErrorHandling.handleApiError({
        error,
        logger: this.logger,
      })
    }
  }

  async getPhoneListDetails(
    listId: number,
  ): Promise<PhoneListDetailsResponseDto> {
    try {
      const response = await this.peerlyHttpService.get(`/phonelists/${listId}`)

      return this.peerlyHttpService.validateResponse(
        response.data,
        PhoneListDetailsResponseDto,
        'details',
      )
    } catch (error) {
      return this.peerlyErrorHandling.handleApiError({
        error,
        logger: this.logger,
      })
    }
  }
}
