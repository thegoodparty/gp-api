import { ContentRaw, Transformer } from '../content.types'

export const noOpTransformer: Transformer<ContentRaw, ContentRaw> = (
  content: ContentRaw[],
) => content
