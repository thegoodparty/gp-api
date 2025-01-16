import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { SLACK_CHANNEL_IDS } from './slackService.config'
import {
  FormattedSlackMessageArgs,
  SlackChannel,
  SlackMessage,
  SlackMessageType,
} from './slackService.types'
import { lastValueFrom } from 'rxjs'
import { Headers, MimeTypes } from 'http-constants-ts'

const { WEBAPP_ROOT_URL, SLACK_APP_ID } = process.env

if (!SLACK_APP_ID) {
  throw new Error('Missing SLACK_APP_ID config')
}

@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name)
  constructor(private readonly httpService: HttpService) {}

  private getChannelConfig(channel: SlackChannel) {
    const channelConfig = SLACK_CHANNEL_IDS[channel]
    if (!channelConfig) {
      throw new InternalServerErrorException(
        `Unknown slack channel: ${channel}`,
      )
    }

    return channelConfig
  }

  async message(message: SlackMessage, channel: SlackChannel) {
    const { channelId, channelToken } = this.getChannelConfig(channel)

    try {
      const { data } = await lastValueFrom(
        this.httpService.post(
          `https://hooks.slack.com/services/${SLACK_APP_ID}/${channelId}/${channelToken}`,
          message,
          {
            headers: {
              [Headers.CONTENT_TYPE]: MimeTypes.APPLICATION_JSON,
            },
          },
        ),
      )
      return data
    } catch (e: unknown) {
      this.logger.error(`Failed to send slack message!`, e)
    }
  }

  async errorMessage({ message, error }) {
    return await this.formattedMessage({
      message,
      error,
      channel: SlackChannel.botDev,
    })
  }

  async aiMessage({ message, error }) {
    return this.formattedMessage({
      message,
      error,
      channel: SlackChannel.botAi,
    })
  }

  async formattedMessage({
    message,
    error,
    channel,
  }: FormattedSlackMessageArgs) {
    return await this.message(
      {
        blocks: [
          {
            type: SlackMessageType.SECTION,
            text: {
              type: SlackMessageType.MRKDWN,
              text: `__________________________________ \n *Message from server* \n ${WEBAPP_ROOT_URL}`,
            },
          },
          {
            type: SlackMessageType.SECTION,
            text: {
              type: SlackMessageType.MRKDWN,
              text: `*${message}*\n\n${JSON.stringify(error)}`,
            },
          },
        ],
      },
      channel,
    )
  }
}
