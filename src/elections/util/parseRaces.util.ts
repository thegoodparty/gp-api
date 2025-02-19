import { RaceNode, RacesByZipcode } from '../types/ballotReady.types'
import { PositionLevel } from 'src/generated/graphql.types'

const isPOTUSorVPOTUSNode = ({ position }) =>
  position?.level === PositionLevel.FEDERAL &&
  position?.name?.toLowerCase().includes('president')

export function parseRaces(
  races: RacesByZipcode['races'],
  existingPositions: Set<string>,
  elections: RaceNode[],
  primaryElectionDates: Record<
    string,
    {
      electionDay: string
      primaryElectionId: string
    }
  >,
) {
  for (const edge of races.edges) {
    const { node } = edge || {}
    const { isPrimary } = node || {}
    const { electionDay, name: electionName } = node?.election || {}
    const { name, hasPrimary, partisanType } = node?.position || {}

    const electionYear = new Date(electionDay).getFullYear()

    if (existingPositions.has(`${name}|${electionYear}`)) {
      continue
    }

    if (electionName.includes('Runoff')) {
      continue
    }

    if ((hasPrimary && isPrimary) || (node && isPOTUSorVPOTUSNode(node))) {
      primaryElectionDates[`${node.position.id}|${electionYear}`] = {
        electionDay,
        primaryElectionId: node?.election?.id,
      }
      continue
    }

    existingPositions.add(`${name}|${electionYear}`)
    elections.push(node)
  }

  // Add primary election dates to general elections
  for (const edge of races.edges) {
    const { node } = edge || {}
    const { isPrimary } = node || {}
    const { hasPrimary, id, partisanType } = node?.position || {}

    if (partisanType === 'partisan') {
      continue
    }

    const { electionDay } = node?.election || {}
    const electionYear = new Date(electionDay).getFullYear()
    const primaryElectionDate = primaryElectionDates[`${id}|${electionYear}`]

    if (id && hasPrimary && !isPrimary && primaryElectionDate) {
      node.election.primaryElectionDate = primaryElectionDate.electionDay
      node.election.primaryElectionId = primaryElectionDate.primaryElectionId
    }
  }
}
