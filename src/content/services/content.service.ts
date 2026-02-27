import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { ContentfulService } from '../../vendors/contentful/contentful.service'
import { Content, ContentType } from '@prisma/client'
import { Entry } from 'contentful'
import {
  CONTENT_TYPE_MAP,
  InferredContentTypes,
} from '../CONTENT_TYPE_MAP.const'
import {
  AIChatPromptContents,
  BlogArticleContentRaw,
  findByTypeOptions,
  GlossaryItemAugmented,
} from '../content.types'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { ProcessTimersService } from '../../shared/services/process-timers.service'
import { preProcessBlogArticleMeta } from '../util/preProcessBlogArticleMeta'
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

  async findAll() {
    return this.findMany()
  }

  async findById(id: string) {
    const content = await this.findFirstOrThrow({
      where: {
        id: {
          equals: id,
          mode: 'insensitive',
        },
      },
    })

    return this.transformContent(content.type, [content])?.[0]
  }

  async findByType({ type, take, orderBy, where }: findByTypeOptions) {
    const queryType =
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

  async fetchGlossaryItems(): Promise<GlossaryItemAugmented[]> {
    const entries = await this.findMany({
      where: {
        type: ContentType.glossaryItem,
      },
    })
    return this.transformContent(
      ContentType.glossaryItem,
      entries,
    ) as GlossaryItemAugmented[]
  }

  async getAiContentPrompts() {
    const [onboardingPrompts, candidatePrompts] = await Promise.all([
      this.findByType({ type: ContentType.onboardingPrompts }),
      this.findByType({ type: InferredContentTypes.candidateContentPrompts }),
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
          const contentTypeDef = CONTENT_TYPE_MAP[
            entry.sys.contentType.sys.id
          ] as (typeof CONTENT_TYPE_MAP)[keyof typeof CONTENT_TYPE_MAP]
          const record = await tx.content.update({
            where: {
              id: entry.sys.id,
            },
            data: {
              data: {
                ...entry.fields,
                updateDate: new Date(entry.sys.updatedAt)
                  .toISOString()
                  .split('T')[0], // lets keep the same format as publishDate e.g "2024-06-14"
              } as InputJsonObject,
            },
          })
          if (contentTypeDef.name === ContentType.blogArticle) {
            const blogArticleMeta = preProcessBlogArticleMeta(
              record as BlogArticleContentRaw,
            )
            await tx.blogArticleMeta.update({
              where: {
                contentId: record.id,
              },
              data: blogArticleMeta,
            })
          }
        }

        for (const entry of createEntries) {
          const contentTypeDef = CONTENT_TYPE_MAP[
            entry.sys.contentType.sys.id
          ] as (typeof CONTENT_TYPE_MAP)[keyof typeof CONTENT_TYPE_MAP]
          const contentRecord = {
            id: entry.sys.id,
            type: contentTypeDef.name as ContentType,
            data: {
              ...entry.fields,
              updateDate: new Date(entry.sys.updatedAt)
                .toISOString()
                .split('T')[0],
            } as InputJsonObject,
          }
          const record = await tx.content.create({
            data: contentRecord,
          })
          if (contentTypeDef.name === ContentType.blogArticle) {
            const blogArticleMeta = preProcessBlogArticleMeta(
              record as BlogArticleContentRaw,
            )
            await tx.blogArticleMeta.create({
              data: blogArticleMeta,
            })
          }
        }

        // No need to delete blogArticleMeta records, as they are cascade deleted
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
