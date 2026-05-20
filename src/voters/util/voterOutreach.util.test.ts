import { OutreachType } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { SlackMessageType } from 'src/vendors/slack/slackService.types'
import { buildSlackBlocks } from './voterOutreach.util'

type TextNode = { type: SlackMessageType; text?: string }

const collectTextElementGroups = (node: unknown): TextNode[][] => {
  if (!node || typeof node !== 'object') return []
  const { elements } = node as { elements?: unknown }
  if (!Array.isArray(elements)) return []
  const hasText = elements.every(
    (e) => e && typeof e === 'object' && 'text' in (e as object),
  )
  if (hasText) return [elements as TextNode[]]
  return elements.flatMap(collectTextElementGroups)
}

const findDueDateValue = (
  blocks: ReturnType<typeof buildSlackBlocks>['blocks'],
): string | undefined => {
  const groups = blocks.flatMap(collectTextElementGroups)
  const group = groups.find((els) =>
    els.some(
      (e) => e.type === SlackMessageType.TEXT && e.text === 'Due Date: ',
    ),
  )
  if (!group) return undefined
  const labelIdx = group.findIndex(
    (e) => e.type === SlackMessageType.TEXT && e.text === 'Due Date: ',
  )
  return group[labelIdx + 1]?.text
}

describe('buildSlackBlocks - campaignPlanDueDate', () => {
  it('always renders "N/A" for the Due Date line', () => {
    const { blocks } = buildSlackBlocks({
      type: OutreachType.text,
      formattedAudience: [],
    })

    expect(findDueDateValue(blocks)).toBe('N/A')
  })
})
