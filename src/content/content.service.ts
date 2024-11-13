import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'
import { CreateContentDto } from './dto/create-content.dto'
import { UpdateContentDto } from './dto/update-content.dto'
import { ContentfulService } from '../contentful/contentful.service'
import { Content, ContentType } from '@prisma/client'
import { difference, intersection } from '../shared/util/sets.util'
import { InputJsonObject, InputJsonValue } from '@prisma/client/runtime/library'

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
  teamMilestone: ContentType.teamMilestone,
  termsOfService: ContentType.termsOfService,
}

@Injectable()
export class ContentService {
  constructor(
    private prisma: PrismaService,
    private contentfulService: ContentfulService,
  ) {}
  create(createContentDto: CreateContentDto) {
    console.log(`createContentDto =>`, createContentDto)
    return 'This action adds a new content'
  }

  findAll() {
    return this.prisma.content.findMany()
  }

  findOne(id: number) {
    return `This action returns a #${id} content`
  }

  update(id: number, updateContentDto: UpdateContentDto) {
    console.log(`updateContentDto =>`, updateContentDto)
    return `This action updates a #${id} content`
  }

  remove(id: number) {
    return `This action removes a #${id} content`
  }

  async getExistingContentIds() {
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

  async syncContent(seed?: boolean) {
    const [entries = [], deletedEntries = []] =
      await this.contentfulService.getSync(seed)
    const entryIds = new Set(entries.map((entry) => entry.sys.id))
    const existingContentIds = await this.getExistingContentIds()
    const existingEntries = intersection(existingContentIds, entryIds)
    const newEntryIds = difference(entryIds, existingContentIds)
    const deletedEntryIds = deletedEntries.map((entry) => entry.sys.id)

    const updateEntries = entries.filter((entry) =>
      existingEntries.has(entry.sys.id),
    )
    const createEntries = entries.filter((entry) =>
      newEntryIds.has(entry.sys.id),
    )

    this.prisma.$transaction(async (tx) => {
      for (let entry of updateEntries) {
        await tx.content.update({
          where: {
            id: entry.sys.id,
          },
          data: { ...entry.fields },
        })
      }
      for (let entry of createEntries) {
        console.dir(entry.sys, { depth: 4, colors: true })
        // TODO: find out why exception isn't being thrown!?!?
        // CONTENT_TYPE_MAP[entry.sys.contentType.sys.id] &&
        await tx.content.create({
          data: {
            id: entry.sys.id,
            type: CONTENT_TYPE_MAP[entry.sys.contentType.sys.id],
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
    })

    return [entries, deletedEntries]
  }
}
