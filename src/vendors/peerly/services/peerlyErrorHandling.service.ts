import { BadGatewayException, HttpException, Injectable } from '@nestjs/common'
import { format } from '@redtea/format-axios-error'
import { isAxiosError } from 'axios'
import { PinoLogger } from 'nestjs-pino'
import { PeerlyApiErrorContext } from '../peerly.types'

interface PeerlyApiErrorResponseData {
  error?: string
  message?: string
  Error?: string
  details?: unknown
  [key: string]: unknown
}

type PeerlyApiErrorInfo = {
  error: unknown
  context?: PeerlyApiErrorContext
  logger?: PinoLogger
}

@Injectable()
export class PeerlyErrorHandlingService {
  async handleApiError(apiErrorInfo: PeerlyApiErrorInfo): Promise<never> {
    const { error, context, logger } = apiErrorInfo
    const formattedError = (isAxiosError(error) && format(error)) || error
    const genericMessage = 'Peerly API ERROR'
    const recoverySuffix = this.formatRecoverySuffix(context?.recoveryInfo)

    logger?.error(
      {
        data: !formattedError ? error : '',
        ...context?.recoveryInfo,
      },
      `${genericMessage}: ${formattedError ? JSON.stringify(formattedError) : ''}${recoverySuffix}`,
    )

    if (error instanceof HttpException) {
      if (context?.customMessage) {
        const ExceptionClass = context.httpExceptionClass ?? BadGatewayException
        throw new ExceptionClass(context.customMessage + recoverySuffix, {
          cause: error,
        })
      }
      throw error
    }

    if (
      isAxiosError<PeerlyApiErrorResponseData>(error) &&
      error.response?.data
    ) {
      const responseData = error.response.data

      logger?.error(
        { data: JSON.stringify(responseData, null, 2) },
        'Peerly API error response:',
      )

      const { error: errorField, message, Error: errorCapital } = responseData
      const parsedMessage =
        errorField || message || errorCapital || 'Unknown API error'

      const ExceptionClass = context?.httpExceptionClass ?? BadGatewayException
      const baseMessage =
        context?.customMessage ?? `Peerly API error: ${parsedMessage}`
      throw new ExceptionClass(baseMessage + recoverySuffix, { cause: error })
    }

    const ExceptionClass = context?.httpExceptionClass ?? BadGatewayException
    const baseMessage = context?.customMessage ?? genericMessage
    throw new ExceptionClass(baseMessage + recoverySuffix, { cause: error })
  }

  private formatRecoverySuffix(
    recoveryInfo?: PeerlyApiErrorContext['recoveryInfo'],
  ): string {
    if (!recoveryInfo || Object.keys(recoveryInfo).length === 0) {
      return ''
    }
    const parts = Object.entries(recoveryInfo)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${v}`)
    return parts.length === 0 ? '' : ` ${parts.join(' ')}`
  }
}
