import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { ContentfulService } from '../../vendors/contentful/contentful.service'
import { Content, ContentType } from '@prisma/client'
import { Entry } from 'contentful'
import {
  CONTENT_TYPE_MAP,
  InferredContentTypes,
} from '../CONTENT_TYPE_MAP.const'
import { AIChatPromptContents, FindByTypeOptions } from '../content.types'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { ProcessTimersService } from '../../shared/services/process-timers.service'
import { InputJsonObject } from '@prisma/client/runtime/client'
import { PinoLogger } from 'nestjs-pino'

@Injectable()
export class ContentService extends createPrismaBase(MODELS.Content) {
  constructor(
    private contentfulService: ContentfulService,
    private timers: ProcessTimersService,
  ) {
    super()
  }

  async findByType({ type, take, orderBy, where }: FindByTypeOptions) {
    const queryType =
      // CMS content types use dynamic string keys — CONTENT_TYPE_MAP is indexed by runtime values
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      CONTENT_TYPE_MAP[type]?.inferredFrom || (type as ContentType)

    const whereCondition = Array.isArray(queryType)
      ? { OR: queryType.map((type) => ({ type })) }
      : { type: queryType }

    const timerId = this.timers.start(`FindContentByType: ${type}`)

    const queryConfig = {
      where: {
        ...whereCondition,
        ...where,
      },
      orderBy: orderBy || undefined,
      take: take || undefined,
    }

    const entries = await this.model.findMany(queryConfig)

    this.timers.end(timerId)

    return this.transformContent(type, entries)
  }

  async getAiContentPrompts() {
    const [onboardingPrompts, candidatePrompts] = await Promise.all([
      this.findByType({ type: ContentType.onboardingPrompts }),
      this.findByType({
        type: InferredContentTypes.candidateContentPrompts,
      }),
    ])
    if (!onboardingPrompts || !candidatePrompts) {
      throw new InternalServerErrorException(
        'Failed to fetch onboardingPrompts and candidateContentPrompts',
      )
    }
    return {
      ...onboardingPrompts,
      ...candidatePrompts,
    }
  }

  async getChatSystemPrompt(initial: boolean = false) {
    const date = new Date()
    const today = date.toISOString().split('T')[0]

    const aiChatPrompts = await this.findFirst({
      where: {
        type: ContentType.aiChatPrompt,
      },
    })

    if (aiChatPrompts == null) throw Error('Failed to load system prompt')

    // CMS content types use dynamic string keys — indexing by runtime key returns broad union
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const promptData = aiChatPrompts.data as AIChatPromptContents

    const initialPrompt = promptData.initialPrompt
    const systemPrompt = promptData.systemPrompt
    const candidateJsonObject = promptData.candidateJson
    let candidateJson = JSON.stringify(candidateJsonObject)
    candidateJson = candidateJson.replace('${today}', today)

    return {
      systemPrompt: initial ? initialPrompt : systemPrompt,
      candidateJson,
    }
  }

  private async getExistingContentIds() {
    return new Set(
      (
        await this.model.findMany({
          select: {
            id: true,
          },
        })
      ).map(({ id }) => id),
    )
  }

  private async getSyncEntriesCategorized(recognizedEntries: Entry[]) {
    const entryIds = new Set(recognizedEntries.map((entry) => entry.sys.id))
    const existingContentIds = await this.getExistingContentIds()
    const existingEntries = existingContentIds.intersection(entryIds)
    const newEntryIds = entryIds.difference(existingContentIds)

    return {
      createEntries: recognizedEntries.filter((entry) =>
        newEntryIds.has(entry.sys.id),
      ),
      updateEntries: recognizedEntries.filter((entry) =>
        existingEntries.has(entry.sys.id),
      ),
    }
  }

  private transformContent(
    type: ContentType | InferredContentTypes,
    entries: Content[],
  ) {
    const timerId = this.timers.start(`TransformContent type: ${type}`)
    // CMS content types use dynamic string keys — CONTENT_TYPE_MAP is indexed by runtime values
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const transformer = CONTENT_TYPE_MAP[type]?.transformer as
      | ((entries: Content[], logger: PinoLogger) => Content[])
      | undefined
    const result: Content[] = transformer
      ? transformer(entries, this.logger)
      : entries
    this.timers.end(timerId)
    return result
  }

  async syncContent() {
    const { allEntries = [], deletedEntries = [] } =
      await this.contentfulService.getSync()
    const recognizedEntries = allEntries.filter((entry: Entry) =>
      Boolean(CONTENT_TYPE_MAP[entry.sys.contentType.sys.id]),
    )
    const { createEntries, updateEntries } =
      await this.getSyncEntriesCategorized(recognizedEntries)
    const deletedEntryIds = deletedEntries.map((entry) => entry.sys.id)

    await this.client.$transaction(
      async (tx) => {
        for (const entry of updateEntries) {
          await tx.content.update({
            where: {
              id: entry.sys.id,
            },
            data: {
              data: {
                ...entry.fields,
                updateDate: new Date(entry.sys.updatedAt)
                  .toISOString()
                  .split('T')[0],
              } as InputJsonObject,
            },
          })
        }

        for (const entry of createEntries) {
          // CMS content types use dynamic string keys — CONTENT_TYPE_MAP is indexed by runtime values
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          const contentTypeDef = CONTENT_TYPE_MAP[
            entry.sys.contentType.sys.id
          ] as (typeof CONTENT_TYPE_MAP)[keyof typeof CONTENT_TYPE_MAP]
          await tx.content.create({
            data: {
              id: entry.sys.id,
              // CMS content types use dynamic string keys — CONTENT_TYPE_MAP is indexed by runtime values
              // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
              type: contentTypeDef.name as ContentType,
              data: {
                ...entry.fields,
                updateDate: new Date(entry.sys.updatedAt)
                  .toISOString()
                  .split('T')[0],
              } as InputJsonObject,
            },
          })
        }

        await tx.content.deleteMany({
          where: {
            id: {
              in: deletedEntryIds,
            },
          },
        })
      },
      { timeout: 60 * 1000 },
    )

    return {
      entries: recognizedEntries,
      createEntries,
      updateEntries,
      deletedEntries,
    }
  }
}
