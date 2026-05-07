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
