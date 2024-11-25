import { GlossaryItemAugmented, GlossaryItemRaw } from '../content.types'
import slugify from 'slugify'
import { transformContentMedia } from '../util/transformContentMedia.util'

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
