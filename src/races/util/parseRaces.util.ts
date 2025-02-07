import { PrimaryElectionDates, RacesByYear } from '../types/ballotData.types'
import { RacesByZipcode } from '../types/ballotReady.types'
import { PositionLevel } from 'src/generated/graphql.types'

const isPOTUSorVPOTUSNode = ({ position }) =>
  position?.level === PositionLevel.FEDERAL &&
  position?.name?.toLowerCase().includes('president')

export function parseRaces(
  races: RacesByZipcode['races'],
  existingPositions: Set<string>,
  racesByYear: RacesByYear,
  primaryElectionDates: PrimaryElectionDates,
) {
  if (!races?.edges?.length) return

  for (const edge of races.edges) {
    const node = edge?.node
    if (!node || !node.election || !node.position) continue

    const { isPrimary } = node || {}
    const { electionDay, name: electionName } = node?.election || {}
    const { name, hasPrimary } = node?.position || {}
    if (!electionDay) continue

    const electionYear = new Date(electionDay).getFullYear()

    if (existingPositions.has(`${name}|${electionYear}`)) {
      continue
    }

    if (electionName.includes('Runoff')) {
      continue
    }

    if (
      // skip primary if the we have primary in that race
      (hasPrimary && isPrimary) ||
      (node && isPOTUSorVPOTUSNode(node))
    ) {
      primaryElectionDates[`${node.position.id}|${electionYear}`] = {
        electionDay,
        primaryElectionId: node.election.id,
      }
      continue
    }
    existingPositions.add(`${name}|${electionYear}`)

    racesByYear[electionYear]
      ? racesByYear[electionYear].push(node)
      : (racesByYear[electionYear] = [node])
  }
  // iterate over the races again and save the primary election date to the general election
  // the position id will be the same for both primary and general election
  // is partisanType is 'partisan' we can ignore the primary election date
  for (const edge of races.edges) {
    const node = edge?.node
    if (!node || !node.election || !node.position) continue

    const { isPrimary } = node || {}
    const { hasPrimary, id, partisanType } = node?.position || {}
    if (partisanType === 'partisan') continue
    const { electionDay } = node.election
    if (!electionDay) continue

    const electionYear = new Date(electionDay).getFullYear()

    // Only update if this node is a general election with a primary counterpart
    if (id && hasPrimary && !isPrimary) {
      const primaryData = primaryElectionDates[`${id}|${electionYear}`]
      if (primaryData) {
        node.election = {
          ...node.election,
          primaryElectionDate: primaryData.electionDay,
          primaryElectionId: primaryData.primaryElectionId,
        }
      }
    }
  }
  return { racesByYear, existingPositions, primaryElectionDates }
}
