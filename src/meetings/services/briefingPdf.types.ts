/**
 * Internal artifact shape used by the briefing PDF renderer. This is a
 * structurally narrowed view over PrismaJson.MeetingBriefingArtifact /
 * MeetingBriefingFull — the renderer touches only what it renders.
 */

export type BriefingTier = 'featured' | 'queued' | 'standard'

export type BriefingType =
  | 'city_council_meeting'
  | 'county_legislature_meeting'
  | 'school_board_meeting'

export interface BriefingItemNews {
  headline: string
  publication: string
}

export interface BriefingItemBudgetImpact {
  summary: string
}

export interface BriefingItemConstituentSentiment {
  summary: string
  detail?: string | null
}

export interface BriefingItemDisplay {
  summary: string
  budget_impact?: BriefingItemBudgetImpact | null
  constituent_sentiment?: BriefingItemConstituentSentiment | null
  recent_news?: BriefingItemNews[] | null
  talking_points?: string[] | null
}

export interface BriefingItem {
  id: string
  title: string
  item_number: string | null
  tier: BriefingTier
  display: BriefingItemDisplay
}

export interface BriefingExecutiveSummary {
  lead_in: string
}

export interface BriefingArtifact {
  briefing_type?: BriefingType | string
  meeting_date?: string
  /** Local meeting start time as `HH:MM` (24h) in the body's timezone. */
  meeting_time?: string
  /** IANA timezone name for `meeting_time` (e.g. `America/Chicago`). */
  meeting_timezone?: string
  meeting_name?: string
  location?: string
  executive_summary: BriefingExecutiveSummary
  items: BriefingItem[]
}

export interface RenderBriefingPdfOptions {
  /**
   * Optional name to render under the title (e.g. "Prepared for <official name>").
   */
  preparedForLine?: string
  /**
   * Optional meeting meta line (e.g. "City Council — May 11, 2026") rendered on
   * the cover and in the running header. Falls back to `meeting_date` on cover.
   */
  meetingMetaLine?: string
  /**
   * Optional URL printed on the cover under a QR code. The QR is generated
   * automatically from this URL when present.
   */
  liveBriefingUrl?: string
  /**
   * Title rendered on the cover and used as the PDF metadata title. Falls
   * back to a generic "Meeting briefing" string if omitted.
   */
  title?: string
}
