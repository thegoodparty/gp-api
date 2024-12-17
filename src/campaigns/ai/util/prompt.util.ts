import { Prisma } from '@prisma/client'
import { CampaignDetailsContent } from 'src/campaigns/campaigns.types'

type CampaignPositionWithRelations = Prisma.CampaignPositionGetPayload<{
  include: { topIssue: true; position: true }
}>

export function positionsToStr(
  campaignPositions: CampaignPositionWithRelations[],
  customIssues?: CampaignDetailsContent['customIssues'],
) {
  if (!campaignPositions && !customIssues) {
    return ''
  }
  let str = ''
  campaignPositions.forEach((campaignPosition, i) => {
    const { position, topIssue } = campaignPosition
    if (position || topIssue) {
      str += `Issue #${i + 1}: ${topIssue?.name}. Position on the issue: ${
        position?.name
      }. Candidate's position: ${campaignPosition?.description}. `
    }
  })

  if (customIssues) {
    customIssues.forEach((issue) => {
      str += `${issue?.title} - ${issue?.position}, `
    })
  }
  return str
}

export function replaceAll(string: string, search: string, replace: string) {
  const replaceStr = replace || 'unknown'
  return string.split(`[[${search}]]`).join(replaceStr)
}

export function againstToStr(
  runningAgainst: CampaignDetailsContent['runningAgainst'],
) {
  if (!runningAgainst) {
    return ''
  }
  let str = ''
  if (runningAgainst.length > 1) {
    str = `${runningAgainst.length} candidates who are: `
  }
  runningAgainst.forEach((opponent, index) => {
    if (index > 0) {
      str += 'and also running against '
    }
    str += `name: ${opponent.name}, party: ${opponent.party} ,description: ${opponent.description}. `
  })
  return str
}
