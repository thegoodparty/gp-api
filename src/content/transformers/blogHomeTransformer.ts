import slugify from 'slugify'
import { BlogHomeRaw, BlogHomeAugmented, Transformer } from '../content.types'

export const blogHomeTransformer: Transformer<
  BlogHomeRaw,
  BlogHomeAugmented
> = (blogHomes: BlogHomeRaw[]): BlogHomeAugmented[] => {
  const blogHome = blogHomes[0]
  const tags =
    blogHome.data?.topTags?.map((tag) => ({
      name: tag?.fields?.name || 'Unknown',
      slug: slugify(tag?.fields?.name || '', { lower: true }),
    })) || []

  const faqs =
    blogHome.data?.articleFaqs?.map((faq) => ({
      title: faq?.fields?.title || 'No title provided',
      id: faq?.sys?.id?.toLowerCase() || 'Unknown-id',
    })) || []

  return [{ tags, faqs }]
}
