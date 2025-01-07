import {
  GoodPartyTeamMembersRaw,
  Transformer,
  GoodPartyTeamMembersAugmented,
} from '../content.types'
import { extractMediaFile } from '../util/extractMediaFile.util'

export const goodPartyTeamMembersTransformer: Transformer<
  GoodPartyTeamMembersRaw,
  GoodPartyTeamMembersAugmented
> = (
  teamMembersRaw: GoodPartyTeamMembersRaw[],
): GoodPartyTeamMembersAugmented[] => {
  const { members: teamMembers } = teamMembersRaw[0].data
  return teamMembers.map((member) => ({
    ...member.fields,
    id: member.sys.id,
    fullName: member.fields.fullName,
    goodPhoto: extractMediaFile(member.fields.goodPhoto),
    partyPhoto: extractMediaFile(member.fields.partyPhoto),
    role: member.fields.role,
    partyRole: member.fields.partyRole,
  }))
}
