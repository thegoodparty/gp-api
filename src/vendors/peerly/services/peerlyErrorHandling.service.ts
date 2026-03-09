import { BadGatewayException, Injectable } from '@nestjs/common'
import { User } from '@prisma/client'
import { format } from '@redtea/format-axios-error'
import { isAxiosError } from 'axios'
import { PinoLogger } from 'nestjs-pino'
import { SlackService } from '../../slack/services/slack.service'
import { SlackChannel } from '../../slack/slackService.types'
import { PeerlyApiErrorContext } from '../peerly.types'
import { buildPeerlySlackErrorMessage } from '../utils/buildPeerlySlackErrorMessage.util'

interface PeerlyApiErrorResponseData {
  error?: string
  message?: string
  Error?: string
  details?: unknown
  [key: string]: unknown
}

@Injectable()
export class PeerlyErrorHandlingService {
  constructor(private readonly slackService: SlackService) {}

  async handleApiError(
    error: unknown,
    context?: PeerlyApiErrorContext,
    logger?: PinoLogger,
  ): Promise<never> {
    const formattedError = (isAxiosError(error) && format(error)) || error
    const genericMessage = 'Peerly API ERROR'

    logger?.error(
      { data: !formattedError ? error : '' },
      `${genericMessage}: ${formattedError ? JSON.stringify(formattedError) : ''}`,
    )

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

      if (context?.user) {
        await this.sendSlackErrorNotification(
          formattedError,
          context.user,
          context.peerlyIdentityId,
        )
      }

      const ExceptionClass = context?.httpExceptionClass ?? BadGatewayException
      throw new ExceptionClass(`Peerly API error: ${parsedMessage}`, {
        cause: error,
      })
    }

    if (context?.user) {
      await this.sendSlackErrorNotification(
        formattedError,
        context.user,
        context.peerlyIdentityId,
      )
    }

    const ExceptionClass = context?.httpExceptionClass ?? BadGatewayException
    throw new ExceptionClass(genericMessage, { cause: error })
  }

  private async sendSlackErrorNotification(
    formattedError: unknown,
    user: User,
    peerlyIdentityId?: string,
  ) {
    const errorString =
      typeof formattedError === 'string'
        ? formattedError
        : JSON.stringify(formattedError)

    const blocks = buildPeerlySlackErrorMessage({
      user,
      formattedError: errorString,
      peerlyIdentityId,
    })

    await this.slackService.message({ blocks }, SlackChannel.bot10DlcCompliance)
  }
}
