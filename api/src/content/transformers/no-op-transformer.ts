import { ContentRaw, Transformer } from '../content.types'

export const noOpTransformer: Transformer = (content: ContentRaw) => content
