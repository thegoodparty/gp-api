import { Domain } from '../../generated/prisma'

type WithMaybeDomain<W> = W & Partial<{ domain: Domain | null }>
type SerializedDomain = Omit<Domain, 'price'> & { price: number | null }
type Serialized<W> = Omit<W, 'domain'> & { domain: SerializedDomain | null }

export const serializeWebsiteWithDomain = <W extends object>(
  website: WithMaybeDomain<W>,
): Serialized<W> => ({
  ...website,
  domain: website.domain
    ? {
        ...website.domain,
        price: website.domain.price?.toNumber() ?? null,
      }
    : null,
})
