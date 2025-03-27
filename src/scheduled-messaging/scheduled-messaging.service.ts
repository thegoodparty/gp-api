import { Injectable } from '@nestjs/common'
import { createPrismaBase, MODELS } from '../prisma/util/prisma.util'
import { ScheduledMessage } from '@prisma/client'

const SCHEDULED_MESSAGING_INTERVAL_SECS = process.env
  .SCHEDULED_MESSAGING_INTERVAL_SECS
  ? parseInt(process.env.SCHEDULED_MESSAGING_INTERVAL_SECS)
  : 60 * 60 // defaults to 1 hour

@Injectable()
export class ScheduledMessagingService extends createPrismaBase(
  MODELS.ScheduledMessage,
) {
  private readonly intervalId: NodeJS.Timeout

  constructor() {
    super()
    this.processScheduledMessages = this.processScheduledMessages.bind(this)
    this.intervalId = setInterval(
      this.processScheduledMessages,
      SCHEDULED_MESSAGING_INTERVAL_SECS * 1000,
    )
    this.logger.debug(
      `Scheduled task running every ${SCHEDULED_MESSAGING_INTERVAL_SECS}s w/ id ${this.intervalId}`,
    )
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

  private async processScheduledMessages() {
    const messages = await this.queryScheduledMessagesAndFlag()

    if (!messages?.length) {
      return []
    }

    this.logger.debug('Sending messages:', messages)
    const updatedMessages: ScheduledMessage[] = []
    await this.client.$transaction(async (tx) => {
      for (let m of messages) {
        const updatedScheduledMsg = await tx.scheduledMessage.update({
          where: {
            id: m.id,
          },
          data: {
            sentAt: new Date(),
            processing: false,
          },
        })
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
    this.logger.debug('Scheduling message: ', { campaignId, messageConfig })
    return await this.model.create({
      data: {
        campaignId,
        messageConfig,
        scheduledAt: sendDate,
      },
    })
  }

  onModuleDestroy() {
    this.logger.debug(`Cleaning up scheduled interval w/ id ${this.intervalId}`)
    clearInterval(this.intervalId)
  }
}
