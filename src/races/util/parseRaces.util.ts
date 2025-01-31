import { OfficeLevel } from '../types/races.types'

const isPOTUSorVPOTUSNode = ({ position }) =>
  position?.level === OfficeLevel.FEDERAL &&
  position?.name?.toLowerCase().includes('president')

export function parseRaces(
  races,
  existingPositions,
  electionsByYear,
  primaryElectionDates,
) {
  for (let i = 0; i < races.edges.length; i++) {
    const { node } = races.edges[i] || {}
    const { isPrimary } = node || {}
    const { electionDay, name: electionName } = node?.election || {}
    const { name, hasPrimary, partisanType } = node?.position || {}

    const electionYear = new Date(electionDay).getFullYear()
    // console.log(`Processing ${name} ${electionYear}`);

    if (existingPositions[`${name}|${electionYear}`]) {
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
        primaryElectionId: node?.election?.id,
      }
      continue
    }
    existingPositions[`${name}|${electionYear}`] = true

    electionsByYear[electionYear]
      ? electionsByYear[electionYear].push(node)
      : (electionsByYear[electionYear] = [node])
  }
  // iterate over the races again and save the primary election date to the general election
  // the position id will be the same for both primary and general election
  // is partisanType is 'partisan' we can ignore the primary election date
  for (let i = 0; i < races.edges.length; i++) {
    const { node } = races.edges[i] || {}
    const { isPrimary } = node || {}
    const { hasPrimary, id, partisanType } = node?.position || {}
    if (partisanType === 'partisan') {
      continue
    }
    const { electionDay, name } = node?.election || {}

    const electionYear = new Date(electionDay).getFullYear()
    const primaryElectionDate = primaryElectionDates[`${id}|${electionYear}`]
    if (id && hasPrimary && !isPrimary && primaryElectionDate) {
      node.election.primaryElectionDate = primaryElectionDate.electionDay
      node.election.primaryElectionId = primaryElectionDate.primaryElectionId
    }
  }
  return { electionsByYear, existingPositions, primaryElectionDates }
}
