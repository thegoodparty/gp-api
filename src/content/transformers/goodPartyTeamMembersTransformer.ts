import {
  GoodPartyTeamMembersAugmented,
  GoodPartyTeamMembersRaw,
  Transformer,
} from '../content.types'
import { extractMediaFile } from '../util/extractMediaFile.util'

export const goodPartyTeamMembersTransformer: Transformer<
  GoodPartyTeamMembersRaw,
  GoodPartyTeamMembersAugmented
> = (
  teamMembersRaw: GoodPartyTeamMembersRaw[],
): GoodPartyTeamMembersAugmented[] => {
  const { members: teamMembers } = teamMembersRaw[0].data
  return teamMembers
    .filter(({ fields }) => Boolean(fields)) // Filter out any members without fields because Contentful likes to randomly place link members in this list 🤬
    .map((member) => ({
      ...member.fields,
      id: member.sys.id,
      fullName: member.fields.fullName,
      goodPhoto: extractMediaFile(member.fields.goodPhoto),
      partyPhoto: extractMediaFile(member.fields.partyPhoto),
      role: member.fields.role,
      partyRole: member.fields.partyRole,
    }))
}
