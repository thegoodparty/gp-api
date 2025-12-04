import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Campaign } from '@prisma/client'
import { CampaignsService } from '../../services/campaigns.service'
import { CreateAiContentSchema } from '../schemas/CreateAiContent.schema'
import { ContentService } from 'src/content/services/content.service'
import { AiService, PromptReplaceCampaign } from 'src/ai/ai.service'
import { SlackService } from 'src/vendors/slack/services/slack.service'
import { QueueProducerService } from 'src/queue/producer/queueProducer.service'
import { camelToSentence } from 'src/shared/util/strings.util'
import { AiChatMessage } from '../chat/aiChat.types'
import { AiContentGenerationStatus, GenerationStatus } from './aiContent.types'
import { SlackChannel } from '../../../vendors/slack/slackService.types'
import { MessageGroup, QueueType } from '../../../queue/queue.types'

@Injectable()
export class AiContentService {
  private readonly logger = new Logger(AiContentService.name)

  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly contentService: ContentService,
    private readonly aiService: AiService,
    private readonly slack: SlackService,
    private readonly queue: QueueProducerService,
  ) {}

  /** function to kickoff ai content generation and enqueue a message to run later */
  async createContent(campaign: Campaign, inputs: CreateAiContentSchema) {
    const { key, regenerate, editMode, chat, inputValues } = inputs

    const { slug, id } = campaign
    const aiContent = campaign.aiContent

    if (!aiContent.generationStatus) {
      aiContent.generationStatus = {}
    }

    if (
      !regenerate &&
      aiContent.generationStatus[key] !== undefined &&
      aiContent.generationStatus[key].status !== undefined &&
      aiContent.generationStatus[key].status === GenerationStatus.processing
    ) {
      return {
        status: GenerationStatus.processing,
        key,
      }
    }
    const existing = aiContent[key]

    if (
      !editMode &&
      aiContent.generationStatus[key] !== undefined &&
      aiContent.generationStatus[key].status === GenerationStatus.completed &&
      existing
    ) {
      return {
        status: GenerationStatus.completed,
        chatResponse: aiContent[key],
      }
    }

    // generating a new ai content here
    const cmsPrompts = await this.contentService.getAiContentPrompts()
    const keyNoDigits = key.replace(/\d+$/, '')
    let prompt = cmsPrompts[keyNoDigits] as string

    const campaignWithRelations = (await this.campaignsService.findFirst({
      where: { id: campaign.id },
      include: {
        pathToVictory: true,
        campaignPositions: {
          include: {
            topIssue: true,
            position: true,
          },
        },
        campaignUpdateHistory: true,
        user: true,
      },
    })) as PromptReplaceCampaign

    if (!campaignWithRelations) {
      throw new NotFoundException(`Campaign not found: ${campaign.id}`)
    }
    prompt = await this.aiService.promptReplace(prompt, campaignWithRelations)
    if (!prompt || prompt === '') {
      await this.slack.errorMessage({
        message: 'empty prompt replace',
        error: {
          cmsPrompt: cmsPrompts[keyNoDigits] as string | undefined,
          promptAfterReplace: prompt,
          campaign,
        },
      })
      throw new Error('No prompt found')
    }
    await this.slack.aiMessage({
      message: 'prompt',
      error: {
        cmsPrompt: cmsPrompts[keyNoDigits] as string | undefined,
        promptAfterReplace: prompt,
      },
    })

    if (!aiContent.generationStatus[key]) {
      aiContent.generationStatus[key] = {} as AiContentGenerationStatus
    }
    aiContent.generationStatus[key].status = GenerationStatus.processing
    aiContent.generationStatus[key].prompt = prompt as string
    aiContent.generationStatus[key].existingChat =
      (chat as AiChatMessage[]) || []
    aiContent.generationStatus[key].inputValues = inputValues
    aiContent.generationStatus[key].createdAt = new Date().valueOf()

    await this.slack.message(
      {
        body: JSON.stringify(aiContent.generationStatus),
      },
      SlackChannel.botDev,
    )

    try {
      this.logger.log(aiContent)
      await this.campaignsService.update({
        where: { id: campaign.id },
        data: { aiContent },
      })
    } catch (e) {
      await this.slack.errorMessage({
        message: 'Error updating generationStatus',
        error: {
          aiContent,
          key,
          id,
          success: false,
        },
      })
      throw e
    }

    const queueMessage = {
      type: QueueType.GENERATE_AI_CONTENT,
      data: {
        slug,
        key,
        regenerate,
      },
    }

    await this.queue.sendMessage(queueMessage, MessageGroup.content)
    await this.slack.aiMessage({
      message: 'Enqueued AI prompt',
      error: queueMessage,
    })

    return {
      status: GenerationStatus.processing,
      key,
      created: true,
    }
  }

  /** Function used to take a queued message and generate ai content */
  async handleGenerateAiContent(message: {
    slug: string
    key: string
    regenerate: boolean
  }) {
    const { slug, key, regenerate } = message

    let campaign: Campaign = await this.campaignsService.findFirstOrThrow({
      where: { slug },
      include: { pathToVictory: true, user: true },
    })
    let aiContent = campaign.aiContent
    const { prompt, existingChat, inputValues } =
      aiContent.generationStatus?.[key] || {}

    if (!aiContent || !prompt) {
      await this.slack.message(
        {
          body: `Missing prompt for ai content generation. slug: ${slug}, key: ${key}, regenerate: ${regenerate}. campaignId: ${
            campaign?.id
          }. message: ${JSON.stringify(message)}`,
        },
        SlackChannel.botDev,
      )
      throw new Error(`error generating ai content. slug: ${slug}, key: ${key}`)
    }

    const chat = existingChat || []
    const messages = [
      { role: 'user', content: prompt } as AiChatMessage,
      ...chat,
    ]
    let chatResponse
    let generateError = false

    try {
      await this.slack.aiMessage({
        message: 'handling campaign from queue',
        error: message,
      })

      let maxTokens = 2000
      if (existingChat && existingChat.length > 0) {
        maxTokens = 2500
      }

      const completion = await this.aiService.llmChatCompletion(
        messages,
        maxTokens,
        0.7,
        0.9,
      )

      chatResponse = completion.content as string
      const totalTokens = completion.tokens

      await this.slack.aiMessage({
        message: `[ ${slug} - ${key} ] Generation Complete. Tokens Used:`,
        error: totalTokens,
      })

      // TODO: figure out if this second load necessary?
      campaign =
        (await this.campaignsService.findFirst({
          where: { slug },
          include: { pathToVictory: true, user: true },
        })) || campaign
      aiContent = campaign.aiContent
      let oldVersion: { date: Date; text: string } | undefined
      if (chatResponse && chatResponse !== '') {
        try {
          const oldVersionData = aiContent[key] as {
            content: string
            updatedAt?: number
          }
          oldVersion = {
            date: new Date(),
            text: oldVersionData.content,
          }
        } catch (_e) {
          // dont warn because this is expected to fail sometimes.
        }
        aiContent[key] = {
          name: camelToSentence(key),
          updatedAt: new Date().valueOf(),
          inputValues,
          content: chatResponse as string,
        }

        this.logger.log('saving campaign version', key)
        this.logger.log('inputValues', inputValues)
        this.logger.log('oldVersion', oldVersion)

        await this.campaignsService.saveCampaignPlanVersion({
          aiContent,
          key,
          campaignId: campaign.id,
          inputValues,
          oldVersion: oldVersion!,
          regenerate: regenerate ? regenerate : false,
        })

        if (
          !aiContent?.generationStatus ||
          typeof aiContent.generationStatus !== 'object'
        ) {
          aiContent.generationStatus = {}
        }
        if (
          !aiContent?.generationStatus[key] ||
          typeof aiContent.generationStatus[key] !== 'object'
        ) {
          aiContent.generationStatus[key] = {} as AiContentGenerationStatus
        }

        aiContent.generationStatus[key].status = GenerationStatus.completed

        await this.campaignsService.update({
          where: { id: campaign.id },
          data: { aiContent },
        })

        await this.slack.aiMessage({
          message: `updated campaign with ai. chatResponse: key: ${key}`,
          error: chatResponse as string,
        })
      }
    } catch (error) {
      const e = error as Error & {
        data?: { error?: string }
      }
      this.logger.error('error at consumer', e)
      this.logger.error('messages', messages)
      generateError = true

      if (e.data?.error) {
        await this.slack.errorMessage({
          message: 'error at AI queue consumer (with msg): ',
          error: e.data.error,
        })
        await this.slack.aiMessage({
          message: 'error at AI queue consumer (with msg): ',
          error: e.data.error,
        })
        this.logger.error('error', e.data.error)
      } else {
        await this.slack.errorMessage({
          message: 'error at AI queue consumer. Queue Message: ',
          error: message,
        })
        await this.slack.errorMessage({
          message: 'error at AI queue consumer debug: ',
          error: e,
        })
        await this.slack.aiMessage({
          message: 'error at AI queue consumer debug: ',
          error: e,
        })
      }
    }

    // Failed to generate content.
    if (!chatResponse || chatResponse === '' || generateError) {
      try {
        // if data does not have key campaignPlanAttempts
        if (!aiContent.campaignPlanAttempts) {
          aiContent.campaignPlanAttempts = {}
        }
        if (!aiContent.campaignPlanAttempts[key]) {
          aiContent.campaignPlanAttempts[key] = 1
        }
        aiContent.campaignPlanAttempts[key] = aiContent.campaignPlanAttempts[
          key
        ]
          ? aiContent.campaignPlanAttempts[key] + 1
          : 1

        await this.slack.aiMessage({
          message: `Current Attempts: ${aiContent.campaignPlanAttempts[key]}`,
        })

        // After 3 attempts, we give up.
        if (
          aiContent.generationStatus?.[key]?.status &&
          aiContent.generationStatus[key].status !==
            GenerationStatus.completed &&
          aiContent.campaignPlanAttempts[key] >= 3
        ) {
          await this.slack.aiMessage({
            message: `Deleting generationStatus for key: ${key}`,
          })
          delete aiContent.generationStatus[key]
        }
        await this.campaignsService.update({
          where: { id: campaign.id },
          data: { aiContent },
        })
      } catch (e) {
        await this.slack.aiMessage({
          message: `Error at consumer updating campaign with ai. key: ${key}`,
          error: e,
        })
        await this.slack.errorMessage({
          message: `Error at consumer updating campaign with ai. key: ${key}`,
          error: e,
        })
        this.logger.error('error at consumer', e)
      }
      // throw an Error so that the message goes back to the queue or the DLQ.
      throw new Error(`error generating ai content. slug: ${slug}, key: ${key}`)
    }
  }
}
