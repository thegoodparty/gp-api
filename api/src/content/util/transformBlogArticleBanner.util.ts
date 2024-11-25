import { transformContentMedia } from './transformContentMedia.util'
import { BlogArticleBannerRaw } from '../content.types'

export const transformBlogArticleBanner = (
  rawBanner: BlogArticleBannerRaw,
) => ({
  ...rawBanner.fields,
  largeImage: transformContentMedia(rawBanner.fields.largeImage),
  smallImage: transformContentMedia(rawBanner.fields.smallImage),
})
