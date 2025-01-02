import {
  Transformer,
  PrivacyPageAugmented,
  PrivacyPageRaw,
} from '../content.types'

export const privacyPageTransformer: Transformer<
  PrivacyPageRaw,
  PrivacyPageAugmented
> = (pages: PrivacyPageRaw[]): PrivacyPageAugmented[] => {
  return [{ ...pages[0].data }]
}
