import { Transformer, RedirectsRaw, RedirectsAugmented } from '../content.types'

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
