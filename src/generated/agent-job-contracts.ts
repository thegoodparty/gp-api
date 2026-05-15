export type MeetingSchedule = MeetingScheduleFound | MeetingScheduleNotFound

export interface AgentJobContracts {
  district_issue_pulse: {
    Input: {
      /**
       * Full city name (e.g. Fayetteville).
       */
      city: string
      /**
       * L2 district value to match (e.g. FAYETTEVILLE CITY WARD 2).
       */
      l2DistrictName: string
      /**
       * L2 voter file column name for district (e.g. City_Ward).
       */
      l2DistrictType: string
      /**
       * 2-letter state code (e.g. NC).
       */
      state: string
    }
    Output: DistrictIssuePulse
  }
  district_issue_snapshot: {
    Input: DistrictIssueSnapshotInput
    Output: DistrictIssueSnapshotOutput
  }
  meeting_briefing: {
    Input: {
      /**
       * Full city name (e.g. Burnsville).
       */
      city: string
      /**
       * Opaque gp-api ElectedOffice.id; passed through to the callback. Not used during research.
       */
      elected_office_id?: string
      /**
       * Governing body name (e.g. City Council).
       */
      office: string
      /**
       * Two-letter state code (e.g. MN).
       */
      state: string
    }
    Output: Briefing
  }
  meeting_schedule: {
    Input: MeetingScheduleInput
    Output: MeetingSchedule
  }
}
export interface DistrictIssuePulse {
  city: string
  generated_at: string
  l2_district_name: string
  l2_district_type: string
  state: string
  /**
   * @minItems 5
   * @maxItems 5
   */
  top_issues: [
    {
      hs_column: string
      issue_label: string
      news: {
        published_date?: string
        source_name: string
        summary: string
        url: string
      }
      rank: number
      voter_count: number
      voter_percentage: number
    },
    {
      hs_column: string
      issue_label: string
      news: {
        published_date?: string
        source_name: string
        summary: string
        url: string
      }
      rank: number
      voter_count: number
      voter_percentage: number
    },
    {
      hs_column: string
      issue_label: string
      news: {
        published_date?: string
        source_name: string
        summary: string
        url: string
      }
      rank: number
      voter_count: number
      voter_percentage: number
    },
    {
      hs_column: string
      issue_label: string
      news: {
        published_date?: string
        source_name: string
        summary: string
        url: string
      }
      rank: number
      voter_count: number
      voter_percentage: number
    },
    {
      hs_column: string
      issue_label: string
      news: {
        published_date?: string
        source_name: string
        summary: string
        url: string
      }
      rank: number
      voter_count: number
      voter_percentage: number
    },
  ]
  total_active_voters: number
}
export interface DistrictIssueSnapshotInput {
  /**
   * Full city name (e.g. Fayetteville).
   */
  city: string
  /**
   * Short issue phrase to match against hs_* columns (e.g. 'affordable housing', 'minimum wage').
   */
  issueKeyword: string
  /**
   * L2 district value to match (e.g. FAYETTEVILLE CITY WARD 2).
   */
  l2DistrictName: string
  /**
   * L2 voter file column name for district (e.g. City_Ward).
   */
  l2DistrictType: string
  /**
   * 2-letter state code (e.g. NC).
   */
  state: string
}
export interface DistrictIssueSnapshotOutput {
  aligned_voter_count: number | null
  aligned_voter_percentage: number | null
  city: string
  generated_at: string
  issue_keyword: string
  issue_label: string
  l2_district_name: string
  l2_district_type: string
  matched_hs_column: string | null
  news: {
    published_date: string
    source_name: string
    summary: string
    title: string
    url: string
  }
  state: string
  total_active_voters: number
}
export interface Briefing {
  actionItems: {
    budgetImpact: {
      sources: string[]
      summary: string
    } | null
    constituentSentiment: {
      detail?: string
      sources: string[]
      summary: string
    } | null
    id: string
    overview: string
    recentNews: {
      outlet: string
      title: string
      url: string
    }[]
    sources: {
      iconInitial: string
      id: string
      kind: 'internal' | 'official' | 'news' | 'community'
      label: string
      url: string | null
    }[]
    talkingPoints: string[]
    title: string
  }[]
  agenda: {
    hasBriefing: boolean
    id: string
    kind: 'procedural' | 'consent' | 'public_input' | 'action' | 'informational'
    title: string
    whatToExpect?: string
  }[]
  executiveSummary: string
  generatedAt: string
  id: string
  meeting: {
    body: string
    id: string
    location: string
    name: string
    scheduledAt: string
    type: 'city_council' | 'planning_board' | 'town_hall'
  }
  meetingDate: string
  meetingId: string
  readingTimeMinutes: number
  slug: string
  status: 'briefing_ready' | 'awaiting_agenda' | 'generating' | 'failed'
  title: string
}
export interface MeetingScheduleInput {
  /**
   * Full city name (e.g. Burnsville).
   */
  city: string
  /**
   * Opaque gp-api ElectedOffice.id; passed through to the callback. Not used during research.
   */
  elected_office_id?: string
  /**
   * Governing body name (e.g. City Council).
   */
  office: string
  /**
   * Two-letter state code (e.g. MN).
   */
  state: string
}
export interface MeetingScheduleFound {
  /**
   * Typical meeting length in minutes.
   */
  duration_minutes: number
  generated_at: string
  /**
   * One-sentence English description of the recurrence; must match the RRULE semantically.
   */
  human: string
  /**
   * iCalendar RFC 5545 RRULE string. MUST NOT contain DTSTART.
   */
  rrule: string
  /**
   * @minItems 1
   * @maxItems 20
   */
  sources:
    | [
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
  status: 'found'
  /**
   * 24-hour HH:MM in local time.
   */
  time: string
  /**
   * IANA timezone name (e.g. America/Denver).
   */
  timezone: string
}
export interface MeetingScheduleNotFound {
  duration_minutes: number
  generated_at: string
  human: string
  rrule: string
  /**
   * @maxItems 20
   */
  sources:
    | []
    | [
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
    | [
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
        {
          note: string
          url: string
        },
      ]
  status: 'not_found'
  time: string
  timezone: string
}
