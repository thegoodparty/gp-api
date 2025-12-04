import { Injectable } from '@nestjs/common'
import { createPrismaBase, MODELS } from '../prisma/util/prisma.util'
import { ScheduledMessage } from '@prisma/client'
import { EmailService } from '../email/email.service'
import { ScheduledMessageTypes } from '../email/email.types'
import { SlackService } from 'src/vendors/slack/services/slack.service'
import { Interval } from '@nestjs/schedule'

const SCHEDULED_MESSAGING_INTERVAL_SECS = process.env
  .SCHEDULED_MESSAGING_INTERVAL_SECS
  ? parseInt(process.env.SCHEDULED_MESSAGING_INTERVAL_SECS)
  : 60 * 60 // defaults to 1 hour

@Injectable()
export class ScheduledMessagingService extends createPrismaBase(
  MODELS.ScheduledMessage,
) {
  constructor(
    private readonly emails: EmailService,
    private readonly slack: SlackService,
  ) {
    super()
  }

  @Interval(SCHEDULED_MESSAGING_INTERVAL_SECS * 1000) // This will run based on the environment variable
  private async processScheduledMessages() {
    this.logger.debug(
      `ScheduledMessagingService::processScheduledMessages task running every ${SCHEDULED_MESSAGING_INTERVAL_SECS}s`,
    )
    const messages: ScheduledMessage[] =
      await this.queryScheduledMessagesAndFlag()

    if (!messages?.length) {
      return []
    }

    this.logger.debug(`Found ${messages.length} messages to send`, messages)

    return this.sendMessagesAndUpdate(messages)
  }

  private async queryScheduledMessagesAndFlag() {
    let messages: ScheduledMessage[] = []
    await this.client.$transaction(async (tx) => {
      messages = await this.model.findMany({
        where: {
          scheduledAt: {
            lte: new Date(),
          },
          processing: false,
          sentAt: {
            equals: null,
          },
          error: {
            equals: null,
          },
        },
      })

      await this.model.updateMany({
        where: {
          id: {
            in: messages.map((m) => m.id),
          },
        },
        data: {
          processing: true, // Ensure no other process is trying to send this message
        },
      })
    })
    return messages
  }

  private sendEmailMessage({ messageConfig: { message } }: ScheduledMessage) {
    if ('template' in message) {
      this.emails.sendTemplateEmail(message)
    } else {
      this.emails.sendEmail(message)
    }
  }

  private async sendMessagesAndUpdate(messages: ScheduledMessage[]) {
    const updatedMessages: ScheduledMessage[] = []
    this.logger.debug('Sending messages:', messages)
    await this.client.$transaction(async (tx) => {
      for (const m of messages) {
        let updatedScheduledMsg: ScheduledMessage

        try {
          switch (m.messageConfig.type) {
            case ScheduledMessageTypes.EMAIL:
              this.sendEmailMessage(m)
          }
        } catch (e) {
          this.logger.error('Error sending message', e)
          const errorMessage = e instanceof Error ? e.toString() : String(e)
          await this.slack.errorMessage({
            message: 'Error sending scheduled message',
            error: e,
          })
          updatedScheduledMsg = (await tx.scheduledMessage.update({
            where: {
              id: m.id,
            },
            data: {
              error: errorMessage,
            },
          })) as ScheduledMessage
          continue
        }

        updatedScheduledMsg = (await tx.scheduledMessage.update({
          where: {
            id: m.id,
          },
          data: {
            sentAt: new Date(),
            processing: false,
          },
        })) as ScheduledMessage
        updatedMessages.push(updatedScheduledMsg)
      }
    })

    return updatedMessages
  }

  async scheduleMessage(
    campaignId: number,
    messageConfig: PrismaJson.ScheduledMessageConfig,
    sendDate: Date,
  ) {
    this.logger.debug('Scheduling message: ', {
      campaignId,
      messageConfig,
      sendDate,
    })
    return await this.model.create({
      data: {
        campaignId,
        messageConfig,
        scheduledAt: sendDate,
      },
    })
  }
}
