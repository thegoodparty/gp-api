import { BlogArticleBannerRaw } from '../content.types'
import { transformContentMedia } from './transformContentMedia.util'

export const transformBlogArticleBanner = (
  rawBanner: BlogArticleBannerRaw,
) => ({
  ...rawBanner.fields,
  largeImage: transformContentMedia(rawBanner.fields.largeImage),
  smallImage: transformContentMedia(rawBanner.fields.smallImage),
})
