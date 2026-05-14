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
  meeting_briefings_experiment_20260513_1447: {
    Input: MeetingBriefingInput
    Output: MeetingBriefingOutput
  }
  meeting_briefings_experiment_20260514_1221: {
    Input: MeetingBriefingInput1
    Output: MeetingBriefingOutput1
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
export interface MeetingBriefingInput {
  /**
   * Permanent URL to the agenda packet PDF. Used as the stable citation URL — never replaced with a presigned fetch URL.
   */
  agendaPacketUrl: string
  /**
   * Optional campaign website URL for the elected official.
   */
  campaignUrl?: string
  /**
   * Full city name (e.g. Alvin).
   */
  city: string
  /**
   * L2 district value to match (e.g. FAYETTEVILLE CITY WARD 2). Optional — omit for at-large city-wide officials.
   */
  l2DistrictName?: string
  /**
   * L2 voter file column name for district (e.g. City_Ward). Optional — omit for at-large city-wide officials.
   */
  l2DistrictType?: string
  /**
   * Date of the council meeting (YYYY-MM-DD).
   */
  meetingDate: string
  /**
   * Full name of the elected official receiving the briefing.
   */
  officialName: string
  /**
   * 2-letter state code (e.g. TX).
   */
  state: string
}
export interface MeetingBriefingOutput {
  /**
   * Every factual claim in the briefing. QA uses this to verify support before release. Stripped from the UI display API response.
   *
   * @minItems 1
   */
  claims: [
    {
      claim_id: string
      /**
       * Verbatim text as it appears in the briefing.
       */
      claim_text: string
      claim_type:
        | 'budget_number'
        | 'vote_count'
        | 'legal_citation'
        | 'staff_recommendation'
        | 'constituent_sentiment'
        | 'news_context'
        | 'historical_context'
        | 'inferred'
      /**
       * Assigned via the claim weight table in instruction.md. Not LLM-inferred.
       */
      claim_weight: 'high' | 'medium' | 'low'
      /**
       * Must match an id in items[].
       */
      item_id: string
      required_source_type:
        | 'agenda_packet'
        | 'government_website'
        | 'news'
        | 'haystaq'
        | 'none'
      route_if_unsupported: 'block_release' | 'omit_claim' | 'flag_as_inferred'
      section:
        | 'overview'
        | 'constituent_sentiment'
        | 'recent_news'
        | 'budget_impact'
        | 'key_observations'
      /**
       * Verbatim passages from sources that support this claim.
       *
       * @minItems 1
       */
      source_extracts: [string, ...string[]]
      /**
       * References to id values in sources[].
       *
       * @minItems 1
       */
      source_ids: [string, ...string[]]
    },
    ...{
      claim_id: string
      /**
       * Verbatim text as it appears in the briefing.
       */
      claim_text: string
      claim_type:
        | 'budget_number'
        | 'vote_count'
        | 'legal_citation'
        | 'staff_recommendation'
        | 'constituent_sentiment'
        | 'news_context'
        | 'historical_context'
        | 'inferred'
      /**
       * Assigned via the claim weight table in instruction.md. Not LLM-inferred.
       */
      claim_weight: 'high' | 'medium' | 'low'
      /**
       * Must match an id in items[].
       */
      item_id: string
      required_source_type:
        | 'agenda_packet'
        | 'government_website'
        | 'news'
        | 'haystaq'
        | 'none'
      route_if_unsupported: 'block_release' | 'omit_claim' | 'flag_as_inferred'
      section:
        | 'overview'
        | 'constituent_sentiment'
        | 'recent_news'
        | 'budget_impact'
        | 'key_observations'
      /**
       * Verbatim passages from sources that support this claim.
       *
       * @minItems 1
       */
      source_extracts: [string, ...string[]]
      /**
       * References to id values in sources[].
       *
       * @minItems 1
       */
      source_ids: [string, ...string[]]
    }[],
  ]
  /**
   * Required AI-assistance disclaimer. Must match verbatim text in instruction.md.
   */
  disclosure: string
  /**
   * Estimated read time in minutes for featured items only.
   */
  estimated_read_minutes: number
  /**
   * Experiment id, echoed from PARAMS.
   */
  experiment_id: string
  /**
   * ISO 8601 UTC timestamp when the briefing was generated.
   */
  generated_at: string
  /**
   * All agenda items in a single array. tier determines display depth and research depth. featured = top 3 shown in UI with full treatment. queued = vote-required but not in top 3; full treatment available in research layer for chatbot. standard = procedural or low-priority; one-sentence summary only.
   *
   * @minItems 1
   */
  items: [
    {
      /**
       * Fields consumed by the UI. Standard items have summary only. Featured and queued items populate all applicable fields.
       */
      display: {
        /**
         * Featured and queued only. Null if no figures available. Do not estimate.
         */
        budget_impact?: {
          /**
           * @minItems 1
           */
          figures: [
            {
              label: string
              source_id: string
              /**
               * Dollar amount copied exactly from source.
               */
              value: string
            },
            ...{
              label: string
              source_id: string
              /**
               * Dollar amount copied exactly from source.
               */
              value: string
            }[],
          ]
          /**
           * Plain-language cost summary extracted from source.
           */
          summary: string
        } | null
        /**
         * Featured and queued only. Null if no relevant Haystaq column or haystaq_status != ok.
         */
        constituent_sentiment?: {
          /**
           * One sentence describing what the score means for this jurisdiction as a modeled estimate. Must disclose it is a modeled estimate, not a direct survey result.
           */
          detail: string
          /**
           * Null if district and city are closely aligned. Set when district meaningfully departs from city, e.g. 'District-level modeled sentiment on this measure is above the citywide estimate.'
           */
          district_note?: string | null
          haystaq_column: string
          haystaq_status: 'ok' | 'city_mismatch' | 'no_match' | 'no_column'
          /**
           * Null unless a true complementary hs_* field was also queried. Do not compute as 100 minus support_pct.
           */
          oppose_pct: number | null
          /**
           * Prose display string using citywide figure. E.g. 'Citywide modeled support on this measure is estimated at 72 on a 0-100 scale.' Not a percentage split.
           */
          summary: string
          /**
           * Citywide mean score for the chosen hs_* column (0-100 scale), representing the primary support or main-direction figure per score_high_means.
           */
          support_pct: number | null
          /**
           * Active voters in the citywide scope used as the denominator.
           */
          voter_count: number | null
        } | null
        /**
         * Featured and queued only. Synthesized observations, each one or two sentences.
         *
         * @minItems 1
         * @maxItems 5
         */
        key_observations?:
          | [string]
          | [string, string]
          | [string, string, string]
          | [string, string, string, string]
          | [string, string, string, string, string]
          | null
        /**
         * Featured and queued only. Up to 3 curated headlines for UI display. Full article text is in research.full_treatment.news_articles.
         *
         * @maxItems 3
         */
        recent_news?:
          | []
          | [
              {
                article_type: 'reporting' | 'opinion' | 'editorial'
                headline: string
                publication: string
                /**
                 * YYYY-MM-DD. Null if exact date could not be confirmed.
                 */
                publication_date: string | null
                url: string
              },
            ]
          | [
              {
                article_type: 'reporting' | 'opinion' | 'editorial'
                headline: string
                publication: string
                /**
                 * YYYY-MM-DD. Null if exact date could not be confirmed.
                 */
                publication_date: string | null
                url: string
              },
              {
                article_type: 'reporting' | 'opinion' | 'editorial'
                headline: string
                publication: string
                /**
                 * YYYY-MM-DD. Null if exact date could not be confirmed.
                 */
                publication_date: string | null
                url: string
              },
            ]
          | [
              {
                article_type: 'reporting' | 'opinion' | 'editorial'
                headline: string
                publication: string
                /**
                 * YYYY-MM-DD. Null if exact date could not be confirmed.
                 */
                publication_date: string | null
                url: string
              },
              {
                article_type: 'reporting' | 'opinion' | 'editorial'
                headline: string
                publication: string
                /**
                 * YYYY-MM-DD. Null if exact date could not be confirmed.
                 */
                publication_date: string | null
                url: string
              },
              {
                article_type: 'reporting' | 'opinion' | 'editorial'
                headline: string
                publication: string
                /**
                 * YYYY-MM-DD. Null if exact date could not be confirmed.
                 */
                publication_date: string | null
                url: string
              },
            ]
          | null
        /**
         * References to top-level sources[] entries for UI inline citation display.
         */
        source_ids?: string[] | null
        /**
         * For featured/queued: what is actually at stake (full overview). For standard: one sentence describing the item and what the official should expect.
         */
        summary: string
      }
      /**
       * Stable item identifier for cross-referencing from claims and raw_context chunks (e.g. 'item_005').
       */
      id: string
      /**
       * Agenda item number as it appears in the packet (e.g. '5F', '6D', '1'). Always a string.
       */
      item_number: string
      /**
       * Deep content layer for the chatbot and QA. Not stripped by gp-api.
       */
      research: {
        /**
         * Present for featured and queued items; null for standard items.
         */
        full_treatment: {
          /**
           * Null if no budget figures found.
           */
          budget_detail: {
            /**
             * @minItems 1
             */
            figures: [
              {
                label: string
                value: string
                /**
                 * Exact text from the source document containing this figure.
                 */
                verbatim_extract: string
              },
              ...{
                label: string
                value: string
                /**
                 * Exact text from the source document containing this figure.
                 */
                verbatim_extract: string
              }[],
            ]
          } | null
          /**
           * Null if no relevant Haystaq column found. Present with status field even on city_mismatch.
           */
          haystaq_detail: {
            /**
             * AVG of chosen hs_* column across all active voters citywide. Primary figure for display.constituent_sentiment.
             */
            city_mean_score?: number | null
            /**
             * COUNT of active voters in the citywide scope.
             */
            city_voter_count?: number | null
            complementary_field?: string | null
            /**
             * AVG of chosen hs_* column across active voters in the official's district. Surfaced in district_note when meaningfully different from city.
             */
            district_mean_score?: number | null
            /**
             * COUNT of active voters in the district scope.
             */
            district_voter_count?: number | null
            haystaq_column?: string | null
            haystaq_status: 'ok' | 'city_mismatch' | 'no_match' | 'no_column'
            /**
             * Sanitized SQL for QA auditability.
             */
            query_executed?: string | null
          } | null
          /**
           * Full fetched content for each article. Null if no news found.
           */
          news_articles:
            | {
                article_type: 'reporting' | 'opinion' | 'editorial'
                /**
                 * Full article body from pmf_runtime.http.get(). Empty string if paywalled — do not omit.
                 */
                body_text: string
                headline: string
                publication: string
                publication_date?: string | null
                url: string
              }[]
            | null
        } | null
        /**
         * Agenda PDF chunks for this item. Each chunk carries redundant item metadata so it is self-contained when retrieved in isolation by a pre-indexing service.
         *
         * @minItems 1
         */
        raw_context: [
          {
            /**
             * Unique chunk id (e.g. 'item_005_p065').
             */
            chunk_id: string
            /**
             * Parent item id — redundant by design for standalone retrieval.
             */
            item_id: string
            /**
             * Parent item title — redundant by design for standalone retrieval.
             */
            item_title: string
            page?: number | null
            section_heading?: string | null
            /**
             * Reference to sources[] entry for this chunk's source document.
             */
            source_id: string
            /**
             * Verbatim extracted text for this chunk.
             */
            text: string
            /**
             * Parent item tier — redundant by design for standalone retrieval.
             */
            tier: 'featured' | 'queued' | 'standard'
          },
          ...{
            /**
             * Unique chunk id (e.g. 'item_005_p065').
             */
            chunk_id: string
            /**
             * Parent item id — redundant by design for standalone retrieval.
             */
            item_id: string
            /**
             * Parent item title — redundant by design for standalone retrieval.
             */
            item_title: string
            page?: number | null
            section_heading?: string | null
            /**
             * Reference to sources[] entry for this chunk's source document.
             */
            source_id: string
            /**
             * Verbatim extracted text for this chunk.
             */
            text: string
            /**
             * Parent item tier — redundant by design for standalone retrieval.
             */
            tier: 'featured' | 'queued' | 'standard'
          }[],
        ]
      }
      /**
       * featured: shown in top-3 UI display. queued: full treatment in research layer, not shown in top 3. standard: one-sentence summary only.
       */
      tier: 'featured' | 'queued' | 'standard'
      /**
       * Reasons driving this item's tier assignment.
       */
      tier_reason: (
        | 'vote_required'
        | 'budget_threshold'
        | 'constituent_alignment'
        | 'public_position_required'
        | 'procedural'
        | 'ceremonial'
        | 'consent_routine'
      )[]
      /**
       * Agenda item title copied exactly from the packet.
       */
      title: string
      /**
       * True if this item requires a council vote.
       */
      vote_required: boolean
    },
    ...{
      /**
       * Fields consumed by the UI. Standard items have summary only. Featured and queued items populate all applicable fields.
       */
      display: {
        /**
         * Featured and queued only. Null if no figures available. Do not estimate.
         */
        budget_impact?: {
          /**
           * @minItems 1
           */
          figures: [
            {
              label: string
              source_id: string
              /**
               * Dollar amount copied exactly from source.
               */
              value: string
            },
            ...{
              label: string
              source_id: string
              /**
               * Dollar amount copied exactly from source.
               */
              value: string
            }[],
          ]
          /**
           * Plain-language cost summary extracted from source.
           */
          summary: string
        } | null
        /**
         * Featured and queued only. Null if no relevant Haystaq column or haystaq_status != ok.
         */
        constituent_sentiment?: {
          /**
           * One sentence describing what the score means for this jurisdiction as a modeled estimate. Must disclose it is a modeled estimate, not a direct survey result.
           */
          detail: string
          /**
           * Null if district and city are closely aligned. Set when district meaningfully departs from city, e.g. 'District-level modeled sentiment on this measure is above the citywide estimate.'
           */
          district_note?: string | null
          haystaq_column: string
          haystaq_status: 'ok' | 'city_mismatch' | 'no_match' | 'no_column'
          /**
           * Null unless a true complementary hs_* field was also queried. Do not compute as 100 minus support_pct.
           */
          oppose_pct: number | null
          /**
           * Prose display string using citywide figure. E.g. 'Citywide modeled support on this measure is estimated at 72 on a 0-100 scale.' Not a percentage split.
           */
          summary: string
          /**
           * Citywide mean score for the chosen hs_* column (0-100 scale), representing the primary support or main-direction figure per score_high_means.
           */
          support_pct: number | null
          /**
           * Active voters in the citywide scope used as the denominator.
           */
          voter_count: number | null
        } | null
        /**
         * Featured and queued only. Synthesized observations, each one or two sentences.
         *
         * @minItems 1
         * @maxItems 5
         */
        key_observations?:
          | [string]
          | [string, string]
          | [string, string, string]
          | [string, string, string, string]
          | [string, string, string, string, string]
          | null
        /**
         * Featured and queued only. Up to 3 curated headlines for UI display. Full article text is in research.full_treatment.news_articles.
         *
         * @maxItems 3
         */
        recent_news?:
          | []
          | [
              {
                article_type: 'reporting' | 'opinion' | 'editorial'
                headline: string
                publication: string
                /**
                 * YYYY-MM-DD. Null if exact date could not be confirmed.
                 */
                publication_date: string | null
                url: string
              },
            ]
          | [
              {
                article_type: 'reporting' | 'opinion' | 'editorial'
                headline: string
                publication: string
                /**
                 * YYYY-MM-DD. Null if exact date could not be confirmed.
                 */
                publication_date: string | null
                url: string
              },
              {
                article_type: 'reporting' | 'opinion' | 'editorial'
                headline: string
                publication: string
                /**
                 * YYYY-MM-DD. Null if exact date could not be confirmed.
                 */
                publication_date: string | null
                url: string
              },
            ]
          | [
              {
                article_type: 'reporting' | 'opinion' | 'editorial'
                headline: string
                publication: string
                /**
                 * YYYY-MM-DD. Null if exact date could not be confirmed.
                 */
                publication_date: string | null
                url: string
              },
              {
                article_type: 'reporting' | 'opinion' | 'editorial'
                headline: string
                publication: string
                /**
                 * YYYY-MM-DD. Null if exact date could not be confirmed.
                 */
                publication_date: string | null
                url: string
              },
              {
                article_type: 'reporting' | 'opinion' | 'editorial'
                headline: string
                publication: string
                /**
                 * YYYY-MM-DD. Null if exact date could not be confirmed.
                 */
                publication_date: string | null
                url: string
              },
            ]
          | null
        /**
         * References to top-level sources[] entries for UI inline citation display.
         */
        source_ids?: string[] | null
        /**
         * For featured/queued: what is actually at stake (full overview). For standard: one sentence describing the item and what the official should expect.
         */
        summary: string
      }
      /**
       * Stable item identifier for cross-referencing from claims and raw_context chunks (e.g. 'item_005').
       */
      id: string
      /**
       * Agenda item number as it appears in the packet (e.g. '5F', '6D', '1'). Always a string.
       */
      item_number: string
      /**
       * Deep content layer for the chatbot and QA. Not stripped by gp-api.
       */
      research: {
        /**
         * Present for featured and queued items; null for standard items.
         */
        full_treatment: {
          /**
           * Null if no budget figures found.
           */
          budget_detail: {
            /**
             * @minItems 1
             */
            figures: [
              {
                label: string
                value: string
                /**
                 * Exact text from the source document containing this figure.
                 */
                verbatim_extract: string
              },
              ...{
                label: string
                value: string
                /**
                 * Exact text from the source document containing this figure.
                 */
                verbatim_extract: string
              }[],
            ]
          } | null
          /**
           * Null if no relevant Haystaq column found. Present with status field even on city_mismatch.
           */
          haystaq_detail: {
            /**
             * AVG of chosen hs_* column across all active voters citywide. Primary figure for display.constituent_sentiment.
             */
            city_mean_score?: number | null
            /**
             * COUNT of active voters in the citywide scope.
             */
            city_voter_count?: number | null
            complementary_field?: string | null
            /**
             * AVG of chosen hs_* column across active voters in the official's district. Surfaced in district_note when meaningfully different from city.
             */
            district_mean_score?: number | null
            /**
             * COUNT of active voters in the district scope.
             */
            district_voter_count?: number | null
            haystaq_column?: string | null
            haystaq_status: 'ok' | 'city_mismatch' | 'no_match' | 'no_column'
            /**
             * Sanitized SQL for QA auditability.
             */
            query_executed?: string | null
          } | null
          /**
           * Full fetched content for each article. Null if no news found.
           */
          news_articles:
            | {
                article_type: 'reporting' | 'opinion' | 'editorial'
                /**
                 * Full article body from pmf_runtime.http.get(). Empty string if paywalled — do not omit.
                 */
                body_text: string
                headline: string
                publication: string
                publication_date?: string | null
                url: string
              }[]
            | null
        } | null
        /**
         * Agenda PDF chunks for this item. Each chunk carries redundant item metadata so it is self-contained when retrieved in isolation by a pre-indexing service.
         *
         * @minItems 1
         */
        raw_context: [
          {
            /**
             * Unique chunk id (e.g. 'item_005_p065').
             */
            chunk_id: string
            /**
             * Parent item id — redundant by design for standalone retrieval.
             */
            item_id: string
            /**
             * Parent item title — redundant by design for standalone retrieval.
             */
            item_title: string
            page?: number | null
            section_heading?: string | null
            /**
             * Reference to sources[] entry for this chunk's source document.
             */
            source_id: string
            /**
             * Verbatim extracted text for this chunk.
             */
            text: string
            /**
             * Parent item tier — redundant by design for standalone retrieval.
             */
            tier: 'featured' | 'queued' | 'standard'
          },
          ...{
            /**
             * Unique chunk id (e.g. 'item_005_p065').
             */
            chunk_id: string
            /**
             * Parent item id — redundant by design for standalone retrieval.
             */
            item_id: string
            /**
             * Parent item title — redundant by design for standalone retrieval.
             */
            item_title: string
            page?: number | null
            section_heading?: string | null
            /**
             * Reference to sources[] entry for this chunk's source document.
             */
            source_id: string
            /**
             * Verbatim extracted text for this chunk.
             */
            text: string
            /**
             * Parent item tier — redundant by design for standalone retrieval.
             */
            tier: 'featured' | 'queued' | 'standard'
          }[],
        ]
      }
      /**
       * featured: shown in top-3 UI display. queued: full treatment in research layer, not shown in top 3. standard: one-sentence summary only.
       */
      tier: 'featured' | 'queued' | 'standard'
      /**
       * Reasons driving this item's tier assignment.
       */
      tier_reason: (
        | 'vote_required'
        | 'budget_threshold'
        | 'constituent_alignment'
        | 'public_position_required'
        | 'procedural'
        | 'ceremonial'
        | 'consent_routine'
      )[]
      /**
       * Agenda item title copied exactly from the packet.
       */
      title: string
      /**
       * True if this item requires a council vote.
       */
      vote_required: boolean
    }[],
  ]
  /**
   * Date of the council meeting (YYYY-MM-DD). Copied exactly from PARAMS.
   */
  meeting_date: string
  /**
   * Name of the elected official. Copied exactly from PARAMS.
   */
  official_name: string
  run_metadata: {
    /**
     * Permanent agendaPacketUrl from PARAMS. Never a presigned fetch URL.
     */
    agenda_packet_url: string
    /**
     * Version tag from the instruction header (e.g. v2).
     */
    briefing_version?: string
    /**
     * ISO 8601 timestamp when the last source was fetched.
     */
    source_bundle_retrieved_at: string
  }
  /**
   * Full bibliography. retrieved_text_or_snapshot must be set at fetch time. Chatbot draws from this field. UI strips retrieved_text_or_snapshot from the display API response.
   *
   * @minItems 1
   */
  sources: [
    {
      article_date?: string | null
      article_type?: 'reporting' | 'opinion' | 'editorial' | null
      /**
       * Active voter count from the query. Haystaq sources only.
       */
      district_voters_n?: number | null
      /**
       * The hs_* column queried. Haystaq sources only.
       */
      haystaq_column?: string | null
      /**
       * Unique identifier for cross-referencing from claims[] and raw_context chunks.
       */
      id: string
      /**
       * Descriptive title of the source document or page.
       */
      name: string
      page_number?: number | null
      /**
       * ISO 8601 timestamp set at fetch time, not at assembly.
       */
      retrieved_at: string
      /**
       * Verbatim text captured at retrieval time. QA and chatbot both depend on this field.
       */
      retrieved_text_or_snapshot: string
      /**
       * Raw mean score from the query. Haystaq sources only.
       */
      score_value?: number | null
      section_heading?: string | null
      source_type:
        | 'agenda_packet'
        | 'news'
        | 'government_website'
        | 'campaign'
        | 'haystaq'
      /**
       * Permanent stable URL. Null for Haystaq (no public URL) and for agenda packet entries where run_metadata.agenda_packet_url is the canonical reference.
       */
      url?: string | null
    },
    ...{
      article_date?: string | null
      article_type?: 'reporting' | 'opinion' | 'editorial' | null
      /**
       * Active voter count from the query. Haystaq sources only.
       */
      district_voters_n?: number | null
      /**
       * The hs_* column queried. Haystaq sources only.
       */
      haystaq_column?: string | null
      /**
       * Unique identifier for cross-referencing from claims[] and raw_context chunks.
       */
      id: string
      /**
       * Descriptive title of the source document or page.
       */
      name: string
      page_number?: number | null
      /**
       * ISO 8601 timestamp set at fetch time, not at assembly.
       */
      retrieved_at: string
      /**
       * Verbatim text captured at retrieval time. QA and chatbot both depend on this field.
       */
      retrieved_text_or_snapshot: string
      /**
       * Raw mean score from the query. Haystaq sources only.
       */
      score_value?: number | null
      section_heading?: string | null
      source_type:
        | 'agenda_packet'
        | 'news'
        | 'government_website'
        | 'campaign'
        | 'haystaq'
      /**
       * Permanent stable URL. Null for Haystaq (no public URL) and for agenda packet entries where run_metadata.agenda_packet_url is the canonical reference.
       */
      url?: string | null
    }[],
  ]
}
export interface MeetingBriefingInput1 {
  /**
   * Permanent URL to the agenda packet PDF. Used as the stable citation URL — never replaced with a presigned fetch URL.
   */
  agendaPacketUrl: string
  /**
   * Optional campaign website URL for the elected official.
   */
  campaignUrl?: string
  /**
   * Full city name (e.g. Alvin).
   */
  city: string
  /**
   * L2 district value to match (e.g. FAYETTEVILLE CITY WARD 2). Omit for at-large city-wide officials.
   */
  l2DistrictName?: string
  /**
   * L2 voter file column name for the official's district (e.g. City_Ward). Omit for at-large city-wide officials — Haystaq will use city scope only.
   */
  l2DistrictType?: string
  /**
   * Date of the council meeting (YYYY-MM-DD).
   */
  meetingDate: string
  /**
   * Full name of the elected official receiving the briefing.
   */
  officialName: string
  /**
   * 2-letter state code (e.g. TX).
   */
  state: string
}
export interface MeetingBriefingOutput1 {
  /**
   * Every factual claim in the briefing. QA uses this to verify support before release. Stripped from the UI display API response.
   *
   * @minItems 1
   */
  claims: [
    {
      claim_id: string
      /**
       * Verbatim text as it appears in the briefing.
       */
      claim_text: string
      claim_type:
        | 'budget_number'
        | 'vote_count'
        | 'legal_citation'
        | 'staff_recommendation'
        | 'constituent_sentiment'
        | 'news_context'
        | 'historical_context'
        | 'inferred'
      /**
       * Assigned via the claim weight table in instruction.md. Not LLM-inferred.
       */
      claim_weight: 'high' | 'medium' | 'low'
      /**
       * Must match an id in items[].
       */
      item_id: string
      required_source_type:
        | 'agenda_packet'
        | 'government_website'
        | 'news'
        | 'haystaq'
        | 'none'
      route_if_unsupported: 'block_release' | 'omit_claim' | 'flag_as_inferred'
      section:
        | 'overview'
        | 'constituent_sentiment'
        | 'recent_news'
        | 'budget_impact'
        | 'key_observations'
      /**
       * Verbatim passages from sources that support this claim.
       *
       * @minItems 1
       */
      source_extracts: [string, ...string[]]
      /**
       * References to id values in sources[].
       *
       * @minItems 1
       */
      source_ids: [string, ...string[]]
    },
    ...{
      claim_id: string
      /**
       * Verbatim text as it appears in the briefing.
       */
      claim_text: string
      claim_type:
        | 'budget_number'
        | 'vote_count'
        | 'legal_citation'
        | 'staff_recommendation'
        | 'constituent_sentiment'
        | 'news_context'
        | 'historical_context'
        | 'inferred'
      /**
       * Assigned via the claim weight table in instruction.md. Not LLM-inferred.
       */
      claim_weight: 'high' | 'medium' | 'low'
      /**
       * Must match an id in items[].
       */
      item_id: string
      required_source_type:
        | 'agenda_packet'
        | 'government_website'
        | 'news'
        | 'haystaq'
        | 'none'
      route_if_unsupported: 'block_release' | 'omit_claim' | 'flag_as_inferred'
      section:
        | 'overview'
        | 'constituent_sentiment'
        | 'recent_news'
        | 'budget_impact'
        | 'key_observations'
      /**
       * Verbatim passages from sources that support this claim.
       *
       * @minItems 1
       */
      source_extracts: [string, ...string[]]
      /**
       * References to id values in sources[].
       *
       * @minItems 1
       */
      source_ids: [string, ...string[]]
    }[],
  ]
  /**
   * Required AI-assistance disclaimer. Must match verbatim text in instruction.md.
   */
  disclosure: string
  /**
   * Estimated read time in minutes for featured items only.
   */
  estimated_read_minutes: number
  /**
   * Experiment id, echoed from PARAMS.
   */
  experiment_id: string
  /**
   * ISO 8601 UTC timestamp when the briefing was generated.
   */
  generated_at: string
  /**
   * All agenda items in a single array. tier determines display depth and research depth. featured = top 3 shown in UI with full treatment. queued = vote-required but not in top 3; full treatment available in research layer for chatbot. standard = procedural or low-priority; one-sentence summary only.
   *
   * @minItems 1
   */
  items: [
    {
      /**
       * Fields consumed by the UI. Standard items have summary only. Featured and queued items populate all applicable fields.
       */
      display: {
        /**
         * Featured and queued only. Null if no figures available. Do not estimate.
         */
        budget_impact?: {
          /**
           * @minItems 1
           */
          figures: [
            {
              label: string
              source_id: string
              /**
               * Dollar amount copied exactly from source.
               */
              value: string
            },
            ...{
              label: string
              source_id: string
              /**
               * Dollar amount copied exactly from source.
               */
              value: string
            }[],
          ]
          /**
           * Plain-language cost summary extracted from source.
           */
          summary: string
        } | null
        /**
         * Featured and queued only. Null if no relevant Haystaq column or haystaq_status != ok.
         */
        constituent_sentiment?: {
          /**
           * One sentence describing what the score means for this jurisdiction as a modeled estimate. Must disclose it is a modeled estimate, not a direct survey result.
           */
          detail: string
          /**
           * Null if district and city are closely aligned. Set when district meaningfully departs from city, e.g. 'District-level modeled sentiment on this measure is above the citywide estimate.'
           */
          district_note?: string | null
          haystaq_column: string
          haystaq_status: 'ok' | 'city_mismatch' | 'no_match' | 'no_column'
          /**
           * Null unless a true complementary hs_* field was also queried. Do not compute as 100 minus support_pct.
           */
          oppose_pct: number | null
          /**
           * Prose display string using citywide figure. E.g. 'Citywide modeled support on this measure is estimated at 72 on a 0-100 scale.' Not a percentage split.
           */
          summary: string
          /**
           * Citywide mean score for the chosen hs_* column (0-100 scale), representing the primary support or main-direction figure per score_high_means.
           */
          support_pct: number | null
          /**
           * Active voters in the citywide scope used as the denominator.
           */
          voter_count: number | null
        } | null
        /**
         * Featured and queued only. Synthesized observations, each one or two sentences.
         *
         * @minItems 1
         * @maxItems 5
         */
        key_observations?:
          | [string]
          | [string, string]
          | [string, string, string]
          | [string, string, string, string]
          | [string, string, string, string, string]
          | null
        /**
         * Featured and queued only. Up to 3 curated headlines for UI display. Full article text is in research.full_treatment.news_articles.
         *
         * @maxItems 3
         */
        recent_news?:
          | []
          | [
              {
                article_type: 'reporting' | 'opinion' | 'editorial'
                headline: string
                publication: string
                /**
                 * YYYY-MM-DD. Null if exact date could not be confirmed.
                 */
                publication_date: string | null
                url: string
              },
            ]
          | [
              {
                article_type: 'reporting' | 'opinion' | 'editorial'
                headline: string
                publication: string
                /**
                 * YYYY-MM-DD. Null if exact date could not be confirmed.
                 */
                publication_date: string | null
                url: string
              },
              {
                article_type: 'reporting' | 'opinion' | 'editorial'
                headline: string
                publication: string
                /**
                 * YYYY-MM-DD. Null if exact date could not be confirmed.
                 */
                publication_date: string | null
                url: string
              },
            ]
          | [
              {
                article_type: 'reporting' | 'opinion' | 'editorial'
                headline: string
                publication: string
                /**
                 * YYYY-MM-DD. Null if exact date could not be confirmed.
                 */
                publication_date: string | null
                url: string
              },
              {
                article_type: 'reporting' | 'opinion' | 'editorial'
                headline: string
                publication: string
                /**
                 * YYYY-MM-DD. Null if exact date could not be confirmed.
                 */
                publication_date: string | null
                url: string
              },
              {
                article_type: 'reporting' | 'opinion' | 'editorial'
                headline: string
                publication: string
                /**
                 * YYYY-MM-DD. Null if exact date could not be confirmed.
                 */
                publication_date: string | null
                url: string
              },
            ]
          | null
        /**
         * References to top-level sources[] entries for UI inline citation display.
         */
        source_ids?: string[] | null
        /**
         * For featured/queued: what is actually at stake (full overview). For standard: one sentence describing the item and what the official should expect.
         */
        summary: string
      }
      /**
       * Stable item identifier for cross-referencing from claims and raw_context chunks (e.g. 'item_005').
       */
      id: string
      /**
       * Agenda item number as it appears in the packet (e.g. '5F', '6D', '1'). Always a string.
       */
      item_number: string
      /**
       * Deep content layer for the chatbot and QA. Not stripped by gp-api.
       */
      research: {
        /**
         * Present for featured and queued items; null for standard items.
         */
        full_treatment: {
          /**
           * Null if no budget figures found.
           */
          budget_detail: {
            /**
             * @minItems 1
             */
            figures: [
              {
                label: string
                value: string
                /**
                 * Exact text from the source document containing this figure.
                 */
                verbatim_extract: string
              },
              ...{
                label: string
                value: string
                /**
                 * Exact text from the source document containing this figure.
                 */
                verbatim_extract: string
              }[],
            ]
          } | null
          /**
           * Null if no relevant Haystaq column found. Present with status field even on city_mismatch.
           */
          haystaq_detail: {
            /**
             * AVG of chosen hs_* column across all active voters citywide. Primary figure for display.constituent_sentiment.
             */
            city_mean_score?: number | null
            /**
             * COUNT of active voters in the citywide scope.
             */
            city_voter_count?: number | null
            complementary_field?: string | null
            /**
             * AVG of chosen hs_* column across active voters in the official's district. Surfaced in district_note when meaningfully different from city.
             */
            district_mean_score?: number | null
            /**
             * COUNT of active voters in the district scope.
             */
            district_voter_count?: number | null
            haystaq_column?: string | null
            haystaq_status: 'ok' | 'city_mismatch' | 'no_match' | 'no_column'
            /**
             * Sanitized SQL for QA auditability.
             */
            query_executed?: string | null
          } | null
          /**
           * Full fetched content for each article. Null if no news found.
           */
          news_articles:
            | {
                article_type: 'reporting' | 'opinion' | 'editorial'
                /**
                 * Full article body from pmf_runtime.http.get(). Empty string if paywalled — do not omit.
                 */
                body_text: string
                headline: string
                publication: string
                publication_date?: string | null
                url: string
              }[]
            | null
        } | null
        /**
         * Agenda PDF chunks for this item. Each chunk carries redundant item metadata so it is self-contained when retrieved in isolation by a pre-indexing service.
         *
         * @minItems 1
         */
        raw_context: [
          {
            /**
             * Unique chunk id (e.g. 'item_005_p065').
             */
            chunk_id: string
            /**
             * Parent item id — redundant by design for standalone retrieval.
             */
            item_id: string
            /**
             * Parent item title — redundant by design for standalone retrieval.
             */
            item_title: string
            page?: number | null
            section_heading?: string | null
            /**
             * Reference to sources[] entry for this chunk's source document.
             */
            source_id: string
            /**
             * Verbatim extracted text for this chunk.
             */
            text: string
            /**
             * Parent item tier — redundant by design for standalone retrieval.
             */
            tier: 'featured' | 'queued' | 'standard'
          },
          ...{
            /**
             * Unique chunk id (e.g. 'item_005_p065').
             */
            chunk_id: string
            /**
             * Parent item id — redundant by design for standalone retrieval.
             */
            item_id: string
            /**
             * Parent item title — redundant by design for standalone retrieval.
             */
            item_title: string
            page?: number | null
            section_heading?: string | null
            /**
             * Reference to sources[] entry for this chunk's source document.
             */
            source_id: string
            /**
             * Verbatim extracted text for this chunk.
             */
            text: string
            /**
             * Parent item tier — redundant by design for standalone retrieval.
             */
            tier: 'featured' | 'queued' | 'standard'
          }[],
        ]
      }
      /**
       * featured: shown in top-3 UI display. queued: full treatment in research layer, not shown in top 3. standard: one-sentence summary only.
       */
      tier: 'featured' | 'queued' | 'standard'
      /**
       * Reasons driving this item's tier assignment.
       */
      tier_reason: (
        | 'vote_required'
        | 'budget_threshold'
        | 'constituent_alignment'
        | 'public_position_required'
        | 'procedural'
        | 'ceremonial'
        | 'consent_routine'
      )[]
      /**
       * Agenda item title copied exactly from the packet.
       */
      title: string
      /**
       * True if this item requires a council vote.
       */
      vote_required: boolean
    },
    ...{
      /**
       * Fields consumed by the UI. Standard items have summary only. Featured and queued items populate all applicable fields.
       */
      display: {
        /**
         * Featured and queued only. Null if no figures available. Do not estimate.
         */
        budget_impact?: {
          /**
           * @minItems 1
           */
          figures: [
            {
              label: string
              source_id: string
              /**
               * Dollar amount copied exactly from source.
               */
              value: string
            },
            ...{
              label: string
              source_id: string
              /**
               * Dollar amount copied exactly from source.
               */
              value: string
            }[],
          ]
          /**
           * Plain-language cost summary extracted from source.
           */
          summary: string
        } | null
        /**
         * Featured and queued only. Null if no relevant Haystaq column or haystaq_status != ok.
         */
        constituent_sentiment?: {
          /**
           * One sentence describing what the score means for this jurisdiction as a modeled estimate. Must disclose it is a modeled estimate, not a direct survey result.
           */
          detail: string
          /**
           * Null if district and city are closely aligned. Set when district meaningfully departs from city, e.g. 'District-level modeled sentiment on this measure is above the citywide estimate.'
           */
          district_note?: string | null
          haystaq_column: string
          haystaq_status: 'ok' | 'city_mismatch' | 'no_match' | 'no_column'
          /**
           * Null unless a true complementary hs_* field was also queried. Do not compute as 100 minus support_pct.
           */
          oppose_pct: number | null
          /**
           * Prose display string using citywide figure. E.g. 'Citywide modeled support on this measure is estimated at 72 on a 0-100 scale.' Not a percentage split.
           */
          summary: string
          /**
           * Citywide mean score for the chosen hs_* column (0-100 scale), representing the primary support or main-direction figure per score_high_means.
           */
          support_pct: number | null
          /**
           * Active voters in the citywide scope used as the denominator.
           */
          voter_count: number | null
        } | null
        /**
         * Featured and queued only. Synthesized observations, each one or two sentences.
         *
         * @minItems 1
         * @maxItems 5
         */
        key_observations?:
          | [string]
          | [string, string]
          | [string, string, string]
          | [string, string, string, string]
          | [string, string, string, string, string]
          | null
        /**
         * Featured and queued only. Up to 3 curated headlines for UI display. Full article text is in research.full_treatment.news_articles.
         *
         * @maxItems 3
         */
        recent_news?:
          | []
          | [
              {
                article_type: 'reporting' | 'opinion' | 'editorial'
                headline: string
                publication: string
                /**
                 * YYYY-MM-DD. Null if exact date could not be confirmed.
                 */
                publication_date: string | null
                url: string
              },
            ]
          | [
              {
                article_type: 'reporting' | 'opinion' | 'editorial'
                headline: string
                publication: string
                /**
                 * YYYY-MM-DD. Null if exact date could not be confirmed.
                 */
                publication_date: string | null
                url: string
              },
              {
                article_type: 'reporting' | 'opinion' | 'editorial'
                headline: string
                publication: string
                /**
                 * YYYY-MM-DD. Null if exact date could not be confirmed.
                 */
                publication_date: string | null
                url: string
              },
            ]
          | [
              {
                article_type: 'reporting' | 'opinion' | 'editorial'
                headline: string
                publication: string
                /**
                 * YYYY-MM-DD. Null if exact date could not be confirmed.
                 */
                publication_date: string | null
                url: string
              },
              {
                article_type: 'reporting' | 'opinion' | 'editorial'
                headline: string
                publication: string
                /**
                 * YYYY-MM-DD. Null if exact date could not be confirmed.
                 */
                publication_date: string | null
                url: string
              },
              {
                article_type: 'reporting' | 'opinion' | 'editorial'
                headline: string
                publication: string
                /**
                 * YYYY-MM-DD. Null if exact date could not be confirmed.
                 */
                publication_date: string | null
                url: string
              },
            ]
          | null
        /**
         * References to top-level sources[] entries for UI inline citation display.
         */
        source_ids?: string[] | null
        /**
         * For featured/queued: what is actually at stake (full overview). For standard: one sentence describing the item and what the official should expect.
         */
        summary: string
      }
      /**
       * Stable item identifier for cross-referencing from claims and raw_context chunks (e.g. 'item_005').
       */
      id: string
      /**
       * Agenda item number as it appears in the packet (e.g. '5F', '6D', '1'). Always a string.
       */
      item_number: string
      /**
       * Deep content layer for the chatbot and QA. Not stripped by gp-api.
       */
      research: {
        /**
         * Present for featured and queued items; null for standard items.
         */
        full_treatment: {
          /**
           * Null if no budget figures found.
           */
          budget_detail: {
            /**
             * @minItems 1
             */
            figures: [
              {
                label: string
                value: string
                /**
                 * Exact text from the source document containing this figure.
                 */
                verbatim_extract: string
              },
              ...{
                label: string
                value: string
                /**
                 * Exact text from the source document containing this figure.
                 */
                verbatim_extract: string
              }[],
            ]
          } | null
          /**
           * Null if no relevant Haystaq column found. Present with status field even on city_mismatch.
           */
          haystaq_detail: {
            /**
             * AVG of chosen hs_* column across all active voters citywide. Primary figure for display.constituent_sentiment.
             */
            city_mean_score?: number | null
            /**
             * COUNT of active voters in the citywide scope.
             */
            city_voter_count?: number | null
            complementary_field?: string | null
            /**
             * AVG of chosen hs_* column across active voters in the official's district. Surfaced in district_note when meaningfully different from city.
             */
            district_mean_score?: number | null
            /**
             * COUNT of active voters in the district scope.
             */
            district_voter_count?: number | null
            haystaq_column?: string | null
            haystaq_status: 'ok' | 'city_mismatch' | 'no_match' | 'no_column'
            /**
             * Sanitized SQL for QA auditability.
             */
            query_executed?: string | null
          } | null
          /**
           * Full fetched content for each article. Null if no news found.
           */
          news_articles:
            | {
                article_type: 'reporting' | 'opinion' | 'editorial'
                /**
                 * Full article body from pmf_runtime.http.get(). Empty string if paywalled — do not omit.
                 */
                body_text: string
                headline: string
                publication: string
                publication_date?: string | null
                url: string
              }[]
            | null
        } | null
        /**
         * Agenda PDF chunks for this item. Each chunk carries redundant item metadata so it is self-contained when retrieved in isolation by a pre-indexing service.
         *
         * @minItems 1
         */
        raw_context: [
          {
            /**
             * Unique chunk id (e.g. 'item_005_p065').
             */
            chunk_id: string
            /**
             * Parent item id — redundant by design for standalone retrieval.
             */
            item_id: string
            /**
             * Parent item title — redundant by design for standalone retrieval.
             */
            item_title: string
            page?: number | null
            section_heading?: string | null
            /**
             * Reference to sources[] entry for this chunk's source document.
             */
            source_id: string
            /**
             * Verbatim extracted text for this chunk.
             */
            text: string
            /**
             * Parent item tier — redundant by design for standalone retrieval.
             */
            tier: 'featured' | 'queued' | 'standard'
          },
          ...{
            /**
             * Unique chunk id (e.g. 'item_005_p065').
             */
            chunk_id: string
            /**
             * Parent item id — redundant by design for standalone retrieval.
             */
            item_id: string
            /**
             * Parent item title — redundant by design for standalone retrieval.
             */
            item_title: string
            page?: number | null
            section_heading?: string | null
            /**
             * Reference to sources[] entry for this chunk's source document.
             */
            source_id: string
            /**
             * Verbatim extracted text for this chunk.
             */
            text: string
            /**
             * Parent item tier — redundant by design for standalone retrieval.
             */
            tier: 'featured' | 'queued' | 'standard'
          }[],
        ]
      }
      /**
       * featured: shown in top-3 UI display. queued: full treatment in research layer, not shown in top 3. standard: one-sentence summary only.
       */
      tier: 'featured' | 'queued' | 'standard'
      /**
       * Reasons driving this item's tier assignment.
       */
      tier_reason: (
        | 'vote_required'
        | 'budget_threshold'
        | 'constituent_alignment'
        | 'public_position_required'
        | 'procedural'
        | 'ceremonial'
        | 'consent_routine'
      )[]
      /**
       * Agenda item title copied exactly from the packet.
       */
      title: string
      /**
       * True if this item requires a council vote.
       */
      vote_required: boolean
    }[],
  ]
  /**
   * Date of the council meeting (YYYY-MM-DD). Copied exactly from PARAMS.
   */
  meeting_date: string
  /**
   * Name of the elected official. Copied exactly from PARAMS.
   */
  official_name: string
  run_metadata: {
    /**
     * Permanent agendaPacketUrl from PARAMS. Never a presigned fetch URL.
     */
    agenda_packet_url: string
    /**
     * Version tag from the instruction header (e.g. v2).
     */
    briefing_version?: string
    /**
     * ISO 8601 timestamp when the last source was fetched.
     */
    source_bundle_retrieved_at: string
  }
  /**
   * Full bibliography. retrieved_text_or_snapshot must be set at fetch time. Chatbot draws from this field. UI strips retrieved_text_or_snapshot from the display API response.
   *
   * @minItems 1
   */
  sources: [
    {
      article_date?: string | null
      article_type?: 'reporting' | 'opinion' | 'editorial' | null
      /**
       * Active voter count from the query. Haystaq sources only.
       */
      district_voters_n?: number | null
      /**
       * The hs_* column queried. Haystaq sources only.
       */
      haystaq_column?: string | null
      /**
       * Unique identifier for cross-referencing from claims[] and raw_context chunks.
       */
      id: string
      /**
       * Descriptive title of the source document or page.
       */
      name: string
      page_number?: number | null
      /**
       * ISO 8601 timestamp set at fetch time, not at assembly.
       */
      retrieved_at: string
      /**
       * Verbatim text captured at retrieval time. QA and chatbot both depend on this field.
       */
      retrieved_text_or_snapshot: string
      /**
       * Raw mean score from the query. Haystaq sources only.
       */
      score_value?: number | null
      section_heading?: string | null
      source_type:
        | 'agenda_packet'
        | 'news'
        | 'government_website'
        | 'campaign'
        | 'haystaq'
      /**
       * Permanent stable URL. Null for Haystaq (no public URL) and for agenda packet entries where run_metadata.agenda_packet_url is the canonical reference.
       */
      url?: string | null
    },
    ...{
      article_date?: string | null
      article_type?: 'reporting' | 'opinion' | 'editorial' | null
      /**
       * Active voter count from the query. Haystaq sources only.
       */
      district_voters_n?: number | null
      /**
       * The hs_* column queried. Haystaq sources only.
       */
      haystaq_column?: string | null
      /**
       * Unique identifier for cross-referencing from claims[] and raw_context chunks.
       */
      id: string
      /**
       * Descriptive title of the source document or page.
       */
      name: string
      page_number?: number | null
      /**
       * ISO 8601 timestamp set at fetch time, not at assembly.
       */
      retrieved_at: string
      /**
       * Verbatim text captured at retrieval time. QA and chatbot both depend on this field.
       */
      retrieved_text_or_snapshot: string
      /**
       * Raw mean score from the query. Haystaq sources only.
       */
      score_value?: number | null
      section_heading?: string | null
      source_type:
        | 'agenda_packet'
        | 'news'
        | 'government_website'
        | 'campaign'
        | 'haystaq'
      /**
       * Permanent stable URL. Null for Haystaq (no public URL) and for agenda packet entries where run_metadata.agenda_packet_url is the canonical reference.
       */
      url?: string | null
    }[],
  ]
}
