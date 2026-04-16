import { Injectable, NotFoundException } from '@nestjs/common'
import { Campaign } from '@prisma/client'
import { CampaignsService } from '../../services/campaigns.service'
import { CreateAiContentSchema } from '../schemas/CreateAiContent.schema'
import { ContentService } from 'src/content/services/content.service'
import { AiService, PromptReplaceCampaign } from 'src/ai/ai.service'
import { SlackService } from 'src/vendors/slack/services/slack.service'
import { QueueProducerService } from 'src/queue/producer/queueProducer.service'
import { camelToSentence } from 'src/shared/util/strings.util'
import { AiChatMessage } from '../chat/aiChat.types'
import { GenerationStatus } from './aiContent.types'
import {
  MessageGroup,
  QueueMessage,
  QueueType,
} from '../../../queue/queue.types'
import { PinoLogger } from 'nestjs-pino'
import { ClerkUserEnricherService } from '@/vendors/clerk/services/clerk-user-enricher.service'

@Injectable()
export class AiContentService {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly contentService: ContentService,
    private readonly aiService: AiService,
    private readonly slack: SlackService,
    private readonly queue: QueueProducerService,
    private readonly clerkEnricher: ClerkUserEnricherService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AiContentService.name)
  }

  private static readonly STALE_PROCESSING_MS = 5 * 60 * 1000

  private isStaleProcessing(keyStatus: {
    createdAt?: number | string
  }): boolean {
    const createdAt = Number(keyStatus.createdAt)
    return (
      !Number.isNaN(createdAt) &&
      Date.now() - createdAt > AiContentService.STALE_PROCESSING_MS
    )
  }

  /** function to kickoff ai content generation and enqueue a message to run later */
  async createContent(campaign: Campaign, inputs: CreateAiContentSchema) {
    const { key, regenerate, editMode, chat, inputValues } = inputs

    const { slug, id } = campaign
    const aiContent = campaign.aiContent

    if (!aiContent.generationStatus) {
      aiContent.generationStatus = {}
    }

    const keyStatus = aiContent.generationStatus[key]
    if (!regenerate && keyStatus?.status === GenerationStatus.processing) {
      if (!this.isStaleProcessing(keyStatus)) {
        return { status: GenerationStatus.processing, key }
      }
      this.logger.warn(
        { key, createdAt: keyStatus.createdAt },
        'Stale processing status detected, re-generating',
      )
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
    // CMS content types use dynamic string keys — indexing by runtime key returns broad union
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    let prompt = cmsPrompts[keyNoDigits] as string

    // Prisma include query — TypeScript cannot narrow the included relations at compile time
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const campaignWithRelations = (await this.campaignsService.findFirst({
      where: { id: campaign.id },
      include: {
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

    if (campaignWithRelations.user) {
      campaignWithRelations.user = await this.clerkEnricher.enrichUser(
        campaignWithRelations.user,
      )
    }

    const liveMetrics = await this.campaignsService.fetchLiveRaceTargetMetrics(
      campaignWithRelations,
    )
    prompt = await this.aiService.promptReplace(
      prompt,
      campaignWithRelations,
      liveMetrics,
    )
    if (!prompt || prompt === '') {
      await this.slack.errorMessage({
        message: 'empty prompt replace',
        error: {
          // CMS content types use dynamic string keys — indexing by runtime key returns broad union
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
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
        // CMS content types use dynamic string keys — indexing by runtime key returns broad union
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        cmsPrompt: cmsPrompts[keyNoDigits] as string | undefined,
        promptAfterReplace: prompt,
      },
    })

    aiContent.generationStatus[key] = {
      ...aiContent.generationStatus[key],
      status: GenerationStatus.processing,
      prompt,
      // Prisma JSON column typed as JsonValue — chat messages stored as JSON array
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      existingChat: (chat as AiChatMessage[]) || [],
      inputValues,
      createdAt: new Date().valueOf(),
    }

    await this.slack.aiMessage({
      message: 'Generation status update',
      error: aiContent.generationStatus,
    })

    try {
      this.logger.info(aiContent)
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

    const queueMessage: QueueMessage = {
      type: QueueType.GENERATE_AI_CONTENT,
      data: {
        slug,
        key,
        regenerate: regenerate ?? false,
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

    let campaign = await this.campaignsService.findFirstOrThrow({
      where: { slug },
      include: { user: true },
    })
    if (campaign.user) {
      campaign.user = await this.clerkEnricher.enrichUser(campaign.user)
    }
    let aiContent = campaign.aiContent
    const { prompt, existingChat, inputValues } =
      aiContent.generationStatus?.[key] || {}

    if (!aiContent || !prompt) {
      await this.slack.errorMessage({
        message: `Missing prompt for ai content generation. slug: ${slug}, key: ${key}, regenerate: ${regenerate}. campaignId: ${campaign?.id}`,
        error: message,
      })
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
          include: { user: true },
        })) || campaign
      if (campaign.user) {
        campaign.user = await this.clerkEnricher.enrichUser(campaign.user)
      }
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
        } catch {
          // dont warn because this is expected to fail sometimes.
        }
        aiContent[key] = {
          name: camelToSentence(key),
          updatedAt: new Date().valueOf(),
          inputValues,
          // LLM response content is string | null — context guarantees string but type does not
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          content: chatResponse as string,
        }

        this.logger.info({ key }, 'saving campaign version')
        this.logger.info({ inputValues }, 'inputValues')
        this.logger.info({ oldVersion }, 'oldVersion')

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
        aiContent.generationStatus[key] = {
          ...aiContent.generationStatus[key],
          status: GenerationStatus.completed,
          createdAt: aiContent.generationStatus[key]?.createdAt ?? Date.now(),
        }

        await this.campaignsService.update({
          where: { id: campaign.id },
          data: { aiContent },
        })

        await this.slack.aiMessage({
          message: `updated campaign with ai. chatResponse: key: ${key}`,
          // LLM response content is string | null — context guarantees string but type does not
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          error: chatResponse as string,
        })
      }
    } catch (error) {
      this.logger.error({ e: error }, 'error at consumer')
      this.logger.error({ messages }, 'messages')
      generateError = true

      // Extract API error data if present (e.g., from OpenAI/Together)
      const apiErrorMessage =
        error != null &&
        typeof error === 'object' &&
        'data' in error &&
        error.data != null &&
        typeof error.data === 'object' &&
        'error' in error.data &&
        typeof error.data.error === 'string'
          ? error.data.error
          : undefined

      if (apiErrorMessage) {
        await this.slack.errorMessage({
          message: 'error at AI queue consumer (with msg): ',
          error: apiErrorMessage,
        })
        await this.slack.aiMessage({
          message: 'error at AI queue consumer (with msg): ',
          error: apiErrorMessage,
        })
        this.logger.error({ error: apiErrorMessage }, 'error')
      } else {
        await this.slack.errorMessage({
          message: 'error at AI queue consumer. Queue Message: ',
          error: message,
        })
        await this.slack.errorMessage({
          message: 'error at AI queue consumer debug: ',
          error,
        })
        await this.slack.aiMessage({
          message: 'error at AI queue consumer debug: ',
          error,
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
        this.logger.error({ e }, 'error at consumer')
      }
      // throw an Error so that the message goes back to the queue or the DLQ.
      throw new Error(`error generating ai content. slug: ${slug}, key: ${key}`)
    }
  }
}
