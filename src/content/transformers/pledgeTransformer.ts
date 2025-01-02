import { Transformer, PledgeAugmented, PledgeRaw } from '../content.types'

export const pledgeTransformer: Transformer<PledgeRaw, PledgeAugmented> = (
  pledges: PledgeRaw[],
): PledgeAugmented[] => {
  return [{ ...pledges[0].data }]
}
