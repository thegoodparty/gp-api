import { Injectable } from '@nestjs/common'
import { ContentfulService } from '../contentful/contentful.service'
import { Content, ContentType, Prisma } from '@prisma/client'
import { InputJsonObject } from '@prisma/client/runtime/library'
import { Entry } from 'contentful'
import {
  CONTENT_TYPE_MAP,
  InferredContentTypes,
} from './CONTENT_TYPE_MAP.const'
import { isObject } from 'src/shared/util/objects.util'
import { AIChatPromptContents } from './content.types'
import { createPrismaBase, MODELS } from 'src/prisma/basePrisma.service'

const transformContent = (
  type: ContentType | InferredContentTypes,
  entries: Content[],
) => {
  const transformer = CONTENT_TYPE_MAP[type]?.transformer
  return transformer ? transformer(entries) : entries
}

@Injectable()
export class ContentService extends createPrismaBase(MODELS.Content) {
  constructor(private contentfulService: ContentfulService) {
    super()
  }

  async findAll() {
    return this.findMany()
  }

  async findById(id: string) {
    return this.findUnique({
      where: {
        id,
      },
    })
  }

  async findByType(
    type: ContentType | InferredContentTypes,
    orderBy?: Prisma.ContentOrderByWithRelationInput,
    take?: number,
  ) {
    const queryType =
      CONTENT_TYPE_MAP[type]?.inferredFrom || (type as ContentType)

    const whereCondition = Array.isArray(queryType)
      ? { OR: queryType.map((type) => ({ type })) }
      : { type: queryType }

    const entries = await this.findMany({
      where: whereCondition,
      orderBy: orderBy || undefined,
      take: take || undefined,
    })

    return transformContent(type, entries)
  }

  async fetchGlossaryItems() {
    const entries = await this.findMany({
      where: {
        type: ContentType.glossaryItem,
      },
    })
    return transformContent(ContentType.glossaryItem, entries)
  }

  async getAiContentPrompts() {
    const prompts = (await this.findMany({
      where: {
        OR: [
          {
            type: ContentType.onboardingPrompts,
          },
          {
            type: ContentType.candidateContentPrompts,
          },
        ],
      },
    })) as Array<Omit<Content, 'data'> & { data: Prisma.JsonObject }>

    if (
      // should be one content record for each "type" of prompt
      prompts.length !== 2 ||
      // ensure that there is prompt data available
      !prompts.some((prompt) => isObject(prompt.data))
    ) {
      throw new Error('Prompt content not found')
    }

    return {
      ...prompts[0].data,
      ...prompts[1].data,
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
              data: entry.fields as InputJsonObject,
            },
          })
        }

        for (const entry of createEntries) {
          await tx.content.create({
            data: {
              id: entry.sys.id,
              type: CONTENT_TYPE_MAP[entry.sys.contentType.sys.id].name,
              data: entry.fields as InputJsonObject,
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
