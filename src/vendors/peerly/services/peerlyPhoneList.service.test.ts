import { BadGatewayException } from '@nestjs/common'
import {
  AxiosError,
  AxiosHeaders,
  AxiosRequestConfig,
  AxiosResponse,
} from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { PeerlyPhoneListService } from './peerlyPhoneList.service'
import { PeerlyErrorHandlingService } from './peerlyErrorHandling.service'
import { PeerlyHttpService } from './peerlyHttp.service'
import { PinoLogger } from 'nestjs-pino'

function createAxiosError(
  responseData: Record<string, unknown> | undefined,
  status = 400,
): AxiosError {
  const config: AxiosRequestConfig = {
    url: '/test-endpoint',
    method: 'GET',
    headers: new AxiosHeaders(),
  }
  const response: AxiosResponse = {
    data: responseData,
    status,
    statusText: 'Bad Request',
    headers: {},
    config: config as AxiosResponse['config'],
  }
  return new AxiosError(
    'Request failed',
    'ERR_BAD_REQUEST',
    config as AxiosError['config'],
    {},
    response,
  )
}

describe('PeerlyPhoneListService', () => {
  let service: PeerlyPhoneListService
  let mockLogger: PinoLogger
  let mockHttpService: {
    get: ReturnType<typeof vi.fn>
    validateResponse: ReturnType<typeof vi.fn>
  }
  let mockErrorHandling: {
    handleApiError: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    mockLogger = createMockLogger()
    mockHttpService = {
      get: vi.fn(),
      validateResponse: vi.fn(),
    }
    mockErrorHandling = {
      handleApiError: vi.fn(),
    }
    service = new PeerlyPhoneListService(
      mockLogger,
      mockHttpService as unknown as PeerlyHttpService,
      mockErrorHandling as unknown as PeerlyErrorHandlingService,
    )
  })

  describe('checkPhoneListStatus', () => {
    it('returns validated response on success', async () => {
      const mockResponse = { data: { list_state: 'ACTIVE', list_id: 123 } }
      const validated = { Data: { list_state: 'ACTIVE', list_id: 123 } }
      mockHttpService.get.mockResolvedValue(mockResponse)
      mockHttpService.validateResponse.mockReturnValue(validated)

      const result = await service.checkPhoneListStatus('test-token')

      expect(result).toBe(validated)
      expect(mockHttpService.get).toHaveBeenCalledWith(
        '/phonelists/test-token/checkstatus',
      )
    })

    it('returns null for transient Peerly 400 error', async () => {
      const error = createAxiosError(
        {
          error: 'There may be an error with the phone list for context',
        },
        400,
      )
      mockHttpService.get.mockRejectedValue(error)

      const result = await service.checkPhoneListStatus('test-token')

      expect(result).toBeNull()
      expect(mockLogger.warn).toHaveBeenCalled()
      expect(mockErrorHandling.handleApiError).not.toHaveBeenCalled()
    })

    it('delegates non-transient errors to handleApiError', async () => {
      const error = createAxiosError({ error: 'Some other error' }, 500)
      mockHttpService.get.mockRejectedValue(error)
      mockErrorHandling.handleApiError.mockRejectedValue(
        new BadGatewayException('Peerly API error: Some other error'),
      )

      await expect(service.checkPhoneListStatus('test-token')).rejects.toThrow(
        BadGatewayException,
      )
      expect(mockErrorHandling.handleApiError).toHaveBeenCalledWith({
        error,
        logger: mockLogger,
      })
    })

    it('delegates non-axios errors to handleApiError', async () => {
      const error = new Error('Network failure')
      mockHttpService.get.mockRejectedValue(error)
      mockErrorHandling.handleApiError.mockRejectedValue(
        new BadGatewayException('Peerly API ERROR'),
      )

      await expect(service.checkPhoneListStatus('test-token')).rejects.toThrow(
        BadGatewayException,
      )
      expect(mockErrorHandling.handleApiError).toHaveBeenCalled()
    })

    it('does not treat 400 without transient message as transient', async () => {
      const error = createAxiosError({ error: 'Invalid token format' }, 400)
      mockHttpService.get.mockRejectedValue(error)
      mockErrorHandling.handleApiError.mockRejectedValue(
        new BadGatewayException('Peerly API error: Invalid token format'),
      )

      await expect(service.checkPhoneListStatus('test-token')).rejects.toThrow(
        BadGatewayException,
      )
      expect(mockErrorHandling.handleApiError).toHaveBeenCalled()
    })
  })
})
