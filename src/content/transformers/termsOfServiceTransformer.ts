import {
  TermsOfServiceAugmented,
  TermsOfServiceRaw,
  Transformer,
} from '../content.types'

export const termsOfServiceTransformer: Transformer<
  TermsOfServiceRaw,
  TermsOfServiceAugmented
> = (terms: TermsOfServiceRaw[]): TermsOfServiceAugmented[] => [
  { ...terms[0].data },
]
