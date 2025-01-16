import { Injectable, Logger } from '@nestjs/common'
import { Campaign } from '@prisma/client'
import { CampaignsService } from '../../services/campaigns.service'
import { CreateAiContentSchema } from '../schemas/CreateAiContent.schema'
import { ContentService } from 'src/content/content.service'

import { AiService } from 'src/ai/ai.service'
import { SlackService } from 'src/shared/services/slack.service'
import { EnqueueService } from 'src/queue/producer/enqueue.service'
import { camelToSentence } from 'src/shared/util/strings.util'
import { AiChatMessage } from '../chat/aiChat.types'
import { AiContentGenerationStatus, GenerationStatus } from './aiContent.types'
import { SlackChannel } from '../../../shared/services/slackService.types'

@Injectable()
export class AiContentService {
  private readonly logger = new Logger(AiContentService.name)

  constructor(
    private campaignsService: CampaignsService,
    private contentService: ContentService,
    private aiService: AiService,
    private slack: SlackService,
    private queue: EnqueueService,
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
    const keyNoDigits = key.replace(/\d+/g, '') // we allow multiple keys like key1, key2
    let prompt = cmsPrompts[keyNoDigits] as string

    const campaignWithRelations = await this.campaignsService.findOne(
      { id: campaign.id },
      {
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
    )
    prompt = await this.aiService.promptReplace(prompt, campaignWithRelations)
    if (!prompt || prompt === '') {
      await this.slack.errorMessage({
        message: 'empty prompt replace',
        error: {
          cmsPrompt: cmsPrompts[keyNoDigits],
          promptAfterReplace: prompt,
          campaign,
        },
      })
      throw new Error('No prompt found')
    }
    await this.slack.aiMessage({
      message: 'prompt',
      error: {
        cmsPrompt: cmsPrompts[keyNoDigits],
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
      await this.campaignsService.update(campaign.id, {
        aiContent,
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
      type: 'generateAiContent',
      data: {
        slug,
        key,
        regenerate,
      },
    }
    await this.queue.sendMessage(queueMessage)
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

    let campaign = await this.campaignsService.findOneOrThrow({ slug })
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

      chatResponse = completion.content
      const totalTokens = completion.tokens

      await this.slack.aiMessage({
        message: `[ ${slug} - ${key} ] Generation Complete. Tokens Used:`,
        error: totalTokens,
      })

      // TODO: figure out if this second load necessary?
      campaign = (await this.campaignsService.findOne({ slug })) || campaign
      aiContent = campaign.aiContent
      let oldVersion
      if (chatResponse && chatResponse !== '') {
        try {
          const oldVersionData = aiContent[key]
          oldVersion = {
            // todo: try to convert oldVersionData.updatedAt to a date object.
            date: new Date().toString(),
            text: oldVersionData.content,
          }
        } catch (_e) {
          // dont warn because this is expected to fail sometimes.
          // console.log('error getting old version', e);
        }
        aiContent[key] = {
          name: camelToSentence(key), // todo: check if this overwrites a name they've chosen.
          updatedAt: new Date().valueOf(),
          inputValues,
          content: chatResponse,
        }

        this.logger.log('saving campaign version', key)
        this.logger.log('inputValues', inputValues)
        this.logger.log('oldVersion', oldVersion)

        await this.campaignsService.saveCampaignPlanVersion({
          aiContent,
          key,
          campaignId: campaign.id,
          inputValues,
          oldVersion,
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

        await this.campaignsService.update(campaign.id, { aiContent })

        await this.slack.aiMessage({
          message: `updated campaign with ai. chatResponse: key: ${key}`,
          error: chatResponse,
        })
      }
    } catch (e: any) {
      this.logger.error('error at consumer', e)
      this.logger.error('messages', messages)
      generateError = true

      if (e.data) {
        await this.slack.errorMessage({
          message: 'error at AI queue consumer (with msg): ',
          error: e.data.error,
        })
        await this.slack.aiMessage({
          message: 'error at AI queue consumer (with msg): ',
          error: e.data.error,
        })
        this.logger.error('error', e.data?.error)
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

        await this.slack.formattedMessage({
          message: `Current Attempts: ${aiContent.campaignPlanAttempts[key]}`,
          channel: SlackChannel.botAi,
        })

        // After 3 attempts, we give up.
        if (
          aiContent.generationStatus?.[key]?.status &&
          aiContent.generationStatus[key].status !==
            GenerationStatus.completed &&
          aiContent.campaignPlanAttempts[key] >= 3
        ) {
          await this.slack.formattedMessage({
            message: `Deleting generationStatus for key: ${key}`,
            channel: SlackChannel.botAi,
          })
          delete aiContent.generationStatus[key]
        }
        await this.campaignsService.update(campaign.id, { aiContent })
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
