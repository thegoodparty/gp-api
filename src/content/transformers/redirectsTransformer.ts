import { RedirectsAugmented, RedirectsRaw, Transformer } from '../content.types'

export const redirectsTransformer: Transformer<
  RedirectsRaw,
  RedirectsAugmented
> = (redirects: RedirectsRaw[]): RedirectsAugmented[] => [
  redirects.reduce(
    (acc, redirect) => ({
      ...acc,
      [redirect.data.pathname]: redirect.data.redirectUrl,
    }),
    {},
  ),
]
