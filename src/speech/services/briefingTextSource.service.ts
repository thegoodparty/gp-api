import { Injectable, NotFoundException } from '@nestjs/common'
import {
  MeetingBriefingResponse,
  SpeechSynthesisTargetType,
} from '@goodparty_org/contracts'
import { MeetingBriefingsService } from '@/meetings/services/meetingBriefings.service'
import {
  LoadedText,
  LoadTextInput,
  TargetTextSource,
} from './targetTextSource.types'

export const BRIEFING_TARGET_TYPE: SpeechSynthesisTargetType = 'MeetingBriefing'

type ActionItem = MeetingBriefingResponse['action_items'][number]

@Injectable()
export class BriefingTextSource
  implements TargetTextSource<SpeechSynthesisTargetType>
{
  readonly type = BRIEFING_TARGET_TYPE

  constructor(private readonly meetingBriefings: MeetingBriefingsService) {}

  async loadText(input: LoadTextInput): Promise<LoadedText> {
    // input.id is the meeting date in YYYY-MM-DD form (validated upstream by
    // the speech synth request schema). The MeetingBriefing model stores
    // meetingDate as a midnight-UTC Date keyed by (electedOfficeId, meetingDate).
    const meetingDate = new Date(`${input.id}T00:00:00Z`)
    const briefing = await this.meetingBriefings.loadBriefingArtifact(
      input.electedOffice.id,
      meetingDate,
    )
    if (!briefing) {
      throw new NotFoundException(
        `No briefing found for elected office ${input.electedOffice.id} on ${input.id}`,
      )
    }
    return {
      text: this.renderBriefingText(briefing),
      cacheKey: this.buildCacheKey(briefing),
    }
  }

  private buildCacheKey(briefing: MeetingBriefingResponse): string {
    // slug + generated_at uniquely identifies a briefing version, so the
    // synthesized audio is invalidated automatically when the briefing is
    // regenerated (different generated_at).
    return `${briefing.slug}:${briefing.generated_at}`
  }

  private renderBriefingText(briefing: MeetingBriefingResponse): string {
    const sections: string[] = []

    sections.push(briefing.title)

    if (briefing.executive_summary) {
      sections.push(briefing.executive_summary)
    }

    for (const item of briefing.action_items) {
      sections.push(this.renderActionItem(item))
    }

    return sections
      .map((section) => this.normalize(section))
      .filter((section) => section.length > 0)
      .join('\n\n')
  }

  private renderActionItem(item: ActionItem): string {
    const parts: string[] = []
    parts.push(`Action item: ${item.title}.`)
    if (item.overview) parts.push(item.overview)
    if (item.constituent_sentiment?.summary) {
      parts.push(`Constituent sentiment: ${item.constituent_sentiment.summary}`)
    }
    if (item.budget_impact?.summary) {
      parts.push(`Budget impact: ${item.budget_impact.summary}`)
    }
    if (item.talking_points.length > 0) {
      parts.push('Talking points.')
      for (const point of item.talking_points) {
        parts.push(point)
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
