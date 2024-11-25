import { ContentMedia, ImageRaw } from '../content.types'

export const transformContentMedia = (img: ImageRaw): ContentMedia =>
  img?.fields?.file && {
    url: img.fields.file.url,
    alt: img.fields.title || '',
    size: img.fields.file.details?.image,
  }
