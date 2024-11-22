import { ContentAugmented, ContentRaw } from '../content.types'
import { Content } from '@prisma/client'
import { FieldsType } from 'contentful'
import slugify from 'slugify'
import { transformContentMedia } from '../util/transformContentMedia.util'

type GlossaryItemRawData = {
  data: FieldsType & {
    title: string
  }
}

type GlossaryItemRaw = ContentRaw<GlossaryItemRawData>

type GlossaryItemAugmented = ContentAugmented<
  Partial<Content> & {
    slug: string
  }
> &
  FieldsType

export const glossaryItemsTransformer = (
  glossaryItems: GlossaryItemRaw[],
): GlossaryItemAugmented[] =>
  glossaryItems.map(
    ({ data, updatedAt }: GlossaryItemRaw): GlossaryItemAugmented => {
      const { title, banner } = data
      const slug = slugify(title, { lower: true })
      return {
        slug,
        updatedAt,
        ...data,
        ...(banner
          ? {
              banner: {
                ...banner.fields,
                largeImage: transformContentMedia(banner.fields.largeImage),
                smallImage: transformContentMedia(banner.fields.smallImage),
              },
            }
          : {}),
      }
    },
  )
