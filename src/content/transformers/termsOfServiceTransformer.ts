import {
  Transformer,
  TermsOfServiceAugmented,
  TermsOfServiceRaw,
} from '../content.types'

export const termsOfServiceTransformer: Transformer<
  TermsOfServiceRaw,
  TermsOfServiceAugmented
> = (terms: TermsOfServiceRaw[]): TermsOfServiceAugmented[] => {
  return [{ ...terms[0].data }]
}
