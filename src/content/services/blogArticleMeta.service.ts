import { Injectable } from '@nestjs/common'
import { createPrismaBase, MODELS } from '../../prisma/util/prisma.util'

@Injectable()
export class BlogArticleMetaService extends createPrismaBase(
  MODELS.BlogArticleMeta,
) {
  constructor() {
    super()
  }

  async findAllBlogArticleTags() {
    const articleTags = await this.model.findMany({
      select: {
        tags: true,
      },
    })
    const dedupedArticleTags = articleTags.reduce((acc, curr) => {
      curr.tags.forEach((tag) => acc.set(tag.slug, tag))
      return acc
    }, new Map<string, PrismaJson.BlogArticleTag>())
    return [...dedupedArticleTags.values()].sort(
      ({ name: aName }, { name: bName }) =>
        aName < bName ? -1 : aName > bName ? 1 : 0,
    )
  }
}
