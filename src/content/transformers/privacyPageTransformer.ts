import {
  PrivacyPageAugmented,
  PrivacyPageRaw,
  Transformer,
} from '../content.types'

export const privacyPageTransformer: Transformer<
  PrivacyPageRaw,
  PrivacyPageAugmented
> = (pages: PrivacyPageRaw[]): PrivacyPageAugmented[] => [{ ...pages[0].data }]
