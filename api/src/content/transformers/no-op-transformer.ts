import { ContentRaw, Transformer } from '../content.module'

export const noOpTransformer: Transformer = (content: ContentRaw) => content
