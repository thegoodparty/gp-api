import { Injectable } from '@nestjs/common'
import { SpeechSynthesisTargetType } from '@goodparty_org/contracts'
import { MeetingsService } from '@/meetings/services/meetings.service'
import { Briefing, PriorityIssue } from '@/meetings/types/briefing.types'
import {
  LoadedText,
  LoadTextInput,
  TargetTextSource,
} from './targetTextSource.types'

export const BRIEFING_TARGET_TYPE: SpeechSynthesisTargetType = 'MeetingBriefing'

@Injectable()
export class BriefingTextSource
  implements TargetTextSource<SpeechSynthesisTargetType>
{
  readonly type = BRIEFING_TARGET_TYPE

  constructor(private readonly meetingsService: MeetingsService) {}

  async loadText(input: LoadTextInput): Promise<LoadedText> {
    const briefing = await this.meetingsService.getBriefing(
      input.organization,
      input.id,
    )
    return {
      text: this.renderBriefingText(briefing),
      cacheKey: this.buildCacheKey(briefing),
    }
  }

  private buildCacheKey(briefing: Briefing): string {
    return [
      briefing.meeting.citySlug,
      briefing.meeting.date,
      briefing.generatedAt,
    ].join(':')
  }

  private renderBriefingText(briefing: Briefing): string {
    const sections: string[] = []

    sections.push(briefing.meeting.title)

    sections.push(briefing.executiveSummary.headline)
    if (briefing.executiveSummary.subheadline) {
      sections.push(briefing.executiveSummary.subheadline)
    }

    for (const issue of briefing.priorityIssues) {
      sections.push(this.renderPriorityIssue(issue))
    }

    if (briefing.fullAgendaSummary) {
      sections.push('Full agenda summary.')
      sections.push(briefing.fullAgendaSummary)
    }

    return sections
      .map((section) => this.normalize(section))
      .filter((section) => section.length > 0)
      .join('\n\n')
  }

  private renderPriorityIssue(issue: PriorityIssue): string {
    const parts: string[] = []
    parts.push(`Priority item ${issue.number}. ${issue.agendaItemTitle}.`)

    parts.push(issue.card.headline)
    parts.push(issue.card.whatYouNeedToDo)
    parts.push(issue.card.askThisInTheRoom)
    if (issue.card.tryThis) {
      parts.push(issue.card.tryThis)
    }

    if (issue.detail) {
      const detail = issue.detail
      parts.push(detail.whatIsHappening)
      parts.push(detail.whatDecision)
      parts.push(detail.whyItMatters)
      parts.push(detail.recommendation)
      parts.push(detail.actionItem)
      parts.push(detail.askThis)
      if (detail.tryThis) {
        parts.push(detail.tryThis)
      }
      if (detail.supportingContext) {
        parts.push(detail.supportingContext)
      }
    }

    return parts.filter((part) => part.length > 0).join(' ')
  }

  private normalize(text: string): string {
    return text
      .replace(/[*_`#>~]+/g, '')
      .replace(/\[(.+?)\]\(.+?\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim()
  }
}
