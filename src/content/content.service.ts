import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'
import { ContentfulService } from '../contentful/contentful.service'
import { Content, ContentType } from '@prisma/client'
import { InputJsonObject } from '@prisma/client/runtime/library'
import {
  DeletedEntry,
  Entry,
  EntryCollection,
  EntrySkeletonType,
} from 'contentful'

type FaqArticleCategoryRaw = {
  sys: {
    id: string
  }
  fields: {
    name: string
  }
}

type FaqArticleEntryRaw = Partial<
  Content & {
    data: InputJsonObject & {
      category: FaqArticleCategoryRaw[]
    }
  }
>

const transformFaqArticle = (entry: FaqArticleEntryRaw) => {
  const category = entry.data.category?.['en-US'][0]
  console.dir(
    category
      ? {
          id: category.sys.id,
          fields: category.fields,
        }
      : {},
    { depth: 2, colors: true },
  )
  return {
    ...entry,
    ...(category
      ? {
          id: category.sys.id,
          fields: category.fields,
        }
      : {}),
  }
}

const transformContentEntry = (entry: Content) => {
  switch (entry.type) {
    case ContentType.faqArticle:
      return transformFaqArticle(entry as FaqArticleEntryRaw)
    default:
      return entry
  }
}

// we have to do this for TypeScript enums 😢
const CONTENT_TYPE_MAP: { [key: string]: ContentType } = {
  aiChatPrompt: ContentType.aiChatPrompt,
  aiContentTemplate: ContentType.aiContentTemplate,
  articleCategory: ContentType.articleCategory,
  blogArticle: ContentType.blogArticle,
  blogHome: ContentType.blogHome,
  blogSection: ContentType.blogSection,
  candidateTestimonial: ContentType.candidateTestimonial,
  election: ContentType.election,
  faqArticle: ContentType.faqArticle,
  faqOrder: ContentType.faqOrder,
  glossaryItem: ContentType.glossaryItem,
  goodPartyTeamMembers: ContentType.goodPartyTeamMembers,
  onboardingPrompts: ContentType.onboardingPrompts,
  pledge: ContentType.pledge,
  privacyPage: ContentType.privacyPage,
  promptInputFields: ContentType.promptInputFields,
  redirects: ContentType.redirects,
  teamMember: ContentType.teamMember,
  teamMilestone: ContentType.teamMilestone,
  termsOfService: ContentType.termsOfService,
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

  async findByType(type: ContentType) {
    const entries = await this.prisma.content.findMany({
      where: {
        type,
      },
    })
    return entries.map(transformContentEntry)
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

  private async getSyncEntriesCategorized(allEntries: Entry[]) {
    const recognizedEntries = allEntries.filter(
      (entry) => CONTENT_TYPE_MAP[entry.sys.contentType.sys.id],
    )
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

  async syncContent(seed: boolean = false) {
    const { allEntries = [], deletedEntries = [] } =
      await this.contentfulService.getSync(seed)
    const recognizedEntries = allEntries.filter(
      (entry: Entry) => CONTENT_TYPE_MAP[entry.sys.type],
    )
    const deletedEntryIds = deletedEntries.map((entry) => entry.sys.id)
    const { createEntries, updateEntries } =
      await this.getSyncEntriesCategorized(allEntries)

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
              type: CONTENT_TYPE_MAP[entry.sys.type],
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
