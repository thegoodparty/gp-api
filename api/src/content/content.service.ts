import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ContentfulService } from '../contentful/contentful.service'
import { Content, ContentType } from '@prisma/client'
import { InputJsonObject } from '@prisma/client/runtime/library'
import { Entry } from 'contentful'
import {
  CONTENT_TYPE_MAP,
  InferredContentTypes,
} from './CONTENT_TYPE_MAP.const'

const transformContent = (
  type: ContentType | InferredContentTypes,
  entries: Content[],
) => {
  const transformer = CONTENT_TYPE_MAP[type]?.transformer
  return transformer ? transformer(entries) : entries
}

@Injectable()
export class ContentService {
  constructor(
    private prisma: PrismaService,
    private contentfulService: ContentfulService,
  ) {}

  async findAll() {
    return this.prisma.content.findMany()
  }

  async findById(id: string) {
    return this.prisma.content.findUnique({
      where: {
        id,
      },
    })
  }

  async findByType(type: ContentType | InferredContentTypes) {
    const queryType =
      CONTENT_TYPE_MAP[type]?.inferredFrom || (type as ContentType)

    const entries = await this.prisma.content.findMany({
      where: {
        type: queryType,
      },
    })

    return transformContent(type, entries)
  }

  private async getExistingContentIds() {
    return new Set(
      (
        await this.prisma.content.findMany({
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

    await this.prisma.$transaction(
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

        console.log(`deletedEntryIds =>`, deletedEntryIds)

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
