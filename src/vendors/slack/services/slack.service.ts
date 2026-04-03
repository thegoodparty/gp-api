import { HttpService } from '@nestjs/axios'
import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { Headers, MimeTypes } from 'http-constants-ts'
import { lastValueFrom } from 'rxjs'
import { SLACK_CHANNEL_IDS } from '../slackService.config'
import {
  FormattedSlackMessageArgs,
  SlackChannel,
  SlackMessage,
  SlackMessageType,
  VanitySlackMethodArgs,
} from '../slackService.types'
import { WebClient } from '@slack/web-api'
import { serializeError } from 'serialize-error'
import { PinoLogger } from 'nestjs-pino'

const { WEBAPP_ROOT_URL, SLACK_APP_ID } = process.env

if (!SLACK_APP_ID) {
  throw new Error('Missing SLACK_APP_ID config')
}

// TODO: Replace w/ this: https://tools.slack.dev/node-slack-sdk/web-api 🤦‍♂️
//  or better yet, this: https://www.npmjs.com/package/nestjs-slack
@Injectable()
export class SlackService {
  public client: WebClient

  constructor(
    private readonly httpService: HttpService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SlackService.name)
    const slackBotToken = process.env.SLACK_APP_BOT_TOKEN
    if (!slackBotToken) {
      throw new Error('Missing SLACK_APP_BOT_TOKEN environment variable')
    }
    this.client = new WebClient(slackBotToken)
  }

  private getChannelConfig(channel: SlackChannel) {
    // Slack channel config indexed by enum — Record index signature returns string | undefined
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const channelConfig = SLACK_CHANNEL_IDS[channel] as
      | { channelId: string; channelToken: string }
      | undefined
    if (!channelConfig) {
      throw new InternalServerErrorException(
        `Unknown slack channel: ${channel}`,
      )
    }

    return channelConfig
  }

  async message(message: SlackMessage, channel: SlackChannel) {
    const { channelId, channelToken } = this.getChannelConfig(channel) as {
      channelId: string
      channelToken: string
    }

    try {
      const { data } = (await lastValueFrom(
        this.httpService.post(
          `https://hooks.slack.com/services/${SLACK_APP_ID}/${channelId}/${channelToken}`,
          message,
          {
            headers: {
              [Headers.CONTENT_TYPE]: MimeTypes.APPLICATION_JSON,
            },
          },
        ),
      )) as { data: string }
      return data
    } catch (e: unknown) {
      this.logger.warn({
        msg: 'Failed to send slack message',
        channel,
        err: serializeError(e),
      })
    }
  }

  async errorMessage(
    { message, error }: VanitySlackMethodArgs,
    channel?: SlackChannel,
  ): Promise<string | undefined> {
    return await this.formattedMessage({
      message,
      // VanitySlackMethodArgs.error is typed as any — passed through to JSON.stringify for logging
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      error,
      channel: channel || SlackChannel.botDev,
    })
  }

  async aiMessage({
    message,
    error,
  }: VanitySlackMethodArgs): Promise<string | undefined> {
    return this.formattedMessage({
      message,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      error,
      channel: SlackChannel.botAi,
    })
  }

  private static readonly SLACK_BLOCK_TEXT_LIMIT = 3000

  async formattedMessage({
    message,
    error,
    channel,
  }: FormattedSlackMessageArgs) {
    let body = `${message}\n\n${error ? JSON.stringify(serializeError(error)) : ''}`
    if (body.length > SlackService.SLACK_BLOCK_TEXT_LIMIT) {
      body =
        body.slice(0, SlackService.SLACK_BLOCK_TEXT_LIMIT - 20) +
        '\n…[truncated]'
    }

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
              text: body,
            },
          },
        ],
      },
      channel,
    )
  }
}
