import { PledgeAugmented, PledgeRaw, Transformer } from '../content.types'

export const pledgeTransformer: Transformer<PledgeRaw, PledgeAugmented> = (
  pledges: PledgeRaw[],
): PledgeAugmented => ({ ...pledges[0].data })
