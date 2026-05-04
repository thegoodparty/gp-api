export interface AgentJobContracts {
  district_intel: {
    Input: {
      /**
       * 2-letter state code (e.g. NC).
       */
      state: string;
      /**
       * Full city name (e.g. Fayetteville).
       */
      city: string;
      /**
       * L2 voter file column name for district (e.g. City_Ward).
       */
      l2DistrictType: string;
      /**
       * L2 district value to match (e.g. FAYETTEVILLE CITY WARD 2).
       */
      l2DistrictName: string;
    };
    Output: {
      official_name: string;
      office: string;
      district: {
        state: string;
        type: string;
        name: string;
        [k: string]: unknown;
      };
      generated_at: string;
      summary: {
        total_constituents: number;
        issues_identified: number;
        meetings_analyzed: number;
        sources_consulted: number;
        [k: string]: unknown;
      };
      issues: {
        title: string;
        summary: string;
        status: string;
        affected_constituents: number;
        affected_segments: {
          name: string;
          count: number;
          description: string;
          [k: string]: unknown;
        }[];
        sources: {
          id: number;
          name: string;
          url: string;
          date: string;
          [k: string]: unknown;
        }[];
        [k: string]: unknown;
      }[];
      demographic_snapshot: {
        total_voters: number;
        party_breakdown: {
          party: string;
          count: number;
          [k: string]: unknown;
        }[];
        age_distribution: {
          range: string;
          count: number;
          [k: string]: unknown;
        }[];
        [k: string]: unknown;
      };
      methodology: string;
      [k: string]: unknown;
    };
  };
  district_issue_pulse: {
    Input: {
      /**
       * 2-letter state code (e.g. NC).
       */
      state: string;
      /**
       * Full city name (e.g. Fayetteville).
       */
      city: string;
      /**
       * L2 voter file column name for district (e.g. City_Ward).
       */
      l2DistrictType: string;
      /**
       * L2 district value to match (e.g. FAYETTEVILLE CITY WARD 2).
       */
      l2DistrictName: string;
    };
    Output: DistrictIssuePulse;
  };
  district_voter_count: {
    Input: {
      /**
       * 2-letter state code (e.g. NC).
       */
      state: string;
      /**
       * Full city name (e.g. Fayetteville).
       */
      city: string;
      /**
       * L2 voter file column name for district (e.g. City_Ward).
       */
      l2DistrictType: string;
      /**
       * L2 district value to match (e.g. FAYETTEVILLE CITY WARD 2).
       */
      l2DistrictName: string;
    };
    Output: {
      district: {
        state: string;
        type: string;
        name: string;
        [k: string]: unknown;
      };
      total_voters: number;
      by_party: {
        party: string;
        count: number;
        [k: string]: unknown;
      }[];
      generated_at: string;
      [k: string]: unknown;
    };
  };
  meeting_briefing: {
    Input: {
      /**
       * 2-letter state code (e.g. NC).
       */
      state: string;
      /**
       * Full city name (e.g. Fayetteville).
       */
      city: string;
      /**
       * L2 voter file column name for district (e.g. City_Ward).
       */
      l2DistrictType: string;
      /**
       * L2 district value to match (e.g. FAYETTEVILLE CITY WARD 2).
       */
      l2DistrictName: string;
      /**
       * run_id of the district_intel run that produced the artifact.
       */
      districtIntelRunId?: string;
      /**
       * S3 bucket of the district_intel artifact.
       */
      districtIntelArtifactBucket?: string;
      /**
       * S3 key of the district_intel artifact, injected by gp-api at dispatch.
       */
      districtIntelArtifactKey?: string;
    };
    Output: {
      eo: {
        name: string;
        city: string;
        state: string;
        office: string;
        [k: string]: unknown;
      };
      meeting: {
        body: string;
        date: string;
        time: string;
        agenda_source: string;
        [k: string]: unknown;
      };
      agenda_items: {
        item_number: string;
        title: string;
        type: string;
        requires_vote: boolean;
        [k: string]: unknown;
      }[];
      fiscal: {
        tax_rate: string;
        budget_total: string;
        source: string;
        [k: string]: unknown;
      };
      data_quality: {
        agenda: string;
        fiscal: string;
        platform: string;
        overall: string;
        [k: string]: unknown;
      };
      teaser_email: string;
      briefing_content: string;
      score: {
        total: number;
        max: number;
        recommendation: string;
        dimensions: {
          id: string;
          name: string;
          score: number;
          justification: string;
          [k: string]: unknown;
        }[];
        [k: string]: unknown;
      };
      sources: {
        id: string;
        type: string;
        title: string;
        url: string;
        accessed_at: string;
        [k: string]: unknown;
      }[];
      generated_at: string;
      based_on_district_intel_run: string;
      [k: string]: unknown;
    };
  };
  peer_city_benchmarking: {
    Input: {
      /**
       * 2-letter state code (e.g. NC).
       */
      state: string;
      /**
       * Full city name (e.g. Fayetteville).
       */
      city: string;
      /**
       * L2 voter file column name for district (e.g. City_Ward).
       */
      l2DistrictType: string;
      /**
       * L2 district value to match (e.g. FAYETTEVILLE CITY WARD 2).
       */
      l2DistrictName: string;
      /**
       * run_id of the district_intel run that produced the artifact.
       */
      districtIntelRunId: string;
      /**
       * S3 bucket of the district_intel artifact.
       */
      districtIntelArtifactBucket: string;
      /**
       * S3 key of the district_intel artifact, injected by gp-api at dispatch.
       */
      districtIntelArtifactKey: string;
    };
    Output: {
      official_name: string;
      office: string;
      district: {
        state: string;
        name: string;
        [k: string]: unknown;
      };
      generated_at: string;
      based_on_district_intel_run: string;
      summary: {
        home_city_population: number;
        peer_cities_analyzed: number;
        issues_compared: number;
        sources_consulted: number;
        [k: string]: unknown;
      };
      home_city: {
        name: string;
        state: string;
        population: number;
        [k: string]: unknown;
      };
      peer_cities: {
        name: string;
        state: string;
        population: number;
        similarity_reason: string;
        [k: string]: unknown;
      }[];
      comparisons: {
        issue: string;
        home_city_approach: string;
        peer_approaches: {
          city: string;
          approach: string;
          outcome: string;
          budget: string;
          timeline: string;
          sources: {
            id: number;
            name: string;
            url: string;
            date: string;
            [k: string]: unknown;
          }[];
          [k: string]: unknown;
        }[];
        takeaways: string;
        [k: string]: unknown;
      }[];
      methodology: string;
      [k: string]: unknown;
    };
  };
  top_issues: {
    Input: {
      /**
       * 2-letter state code (e.g. NC).
       */
      state: string;
      /**
       * Full city name (e.g. Fayetteville).
       */
      city: string;
      /**
       * L2 voter file column name for district (e.g. City_Ward).
       */
      l2DistrictType: string;
      /**
       * L2 district value to match (e.g. FAYETTEVILLE CITY WARD 2).
       */
      l2DistrictName: string;
    };
    Output: {
      district: {
        state: string;
        type: string;
        name: string;
        [k: string]: unknown;
      };
      summary: {
        total_voters_analyzed: number;
        issues_evaluated: number;
        sources_consulted: number;
        [k: string]: unknown;
      };
      top_issues: {
        rank: number;
        issue: string;
        haystaq_signal: string;
        supporters_count: number;
        supporters_pct: number;
        current_context: string;
        sources: {
          id: number;
          name: string;
          url: string;
          date?: string;
          [k: string]: unknown;
        }[];
        [k: string]: unknown;
      }[];
      methodology: string;
      generated_at: string;
      [k: string]: unknown;
    };
  };
  voter_targeting: {
    Input: {
      /**
       * 2-letter state code (e.g. NC).
       */
      state: string;
      /**
       * Full city name (e.g. Fayetteville).
       */
      city: string;
      /**
       * L2 voter file column name for district (e.g. City_Ward).
       */
      l2DistrictType: string;
      /**
       * L2 district value to match (e.g. FAYETTEVILLE CITY WARD 2).
       */
      l2DistrictName: string;
    };
    Output: {
      organization_slug: string;
      district: {
        state: string;
        type: string;
        name: string;
        [k: string]: unknown;
      };
      generated_at: string;
      summary: {
        total_voters_in_district: number;
        win_number: number;
        projected_turnout: number;
        [k: string]: unknown;
      };
      segments: {
        tier: number;
        name: string;
        description: string;
        count: number;
        demographics: {
          party_breakdown: {
            [k: string]: unknown;
          };
          age_distribution: {
            [k: string]: unknown;
          };
          gender_split: {
            [k: string]: unknown;
          };
          [k: string]: unknown;
        };
        outreach_priority: string;
        recommended_channels: string[];
        voters: {
          voter_id: string;
          first_name: string;
          last_name: string;
          address: string;
          city: string;
          zip: string;
          age: number;
          gender: string;
          party: string;
          voter_status: string;
          [k: string]: unknown;
        }[];
        [k: string]: unknown;
      }[];
      geographic_clusters: {
        area: string;
        voter_count: number;
        density_rank: number;
        [k: string]: unknown;
      }[];
      methodology: string;
      [k: string]: unknown;
    };
  };
  walking_plan: {
    Input: {
      /**
       * 2-letter state code (e.g. NC).
       */
      state: string;
      /**
       * Full city name (e.g. Fayetteville).
       */
      city: string;
      /**
       * L2 voter file column name for district (e.g. City_Ward).
       */
      l2DistrictType: string;
      /**
       * L2 district value to match (e.g. FAYETTEVILLE CITY WARD 2).
       */
      l2DistrictName: string;
    };
    Output: {
      organization_slug: string;
      district: {
        state: string;
        [k: string]: unknown;
      };
      generated_at: string;
      summary: {
        total_areas: number;
        total_doors: number;
        estimated_total_hours: number;
        top_issues: string[];
        [k: string]: unknown;
      };
      areas: {
        name: string;
        zip: string;
        city: string;
        priority_rank: number;
        door_count: number;
        estimated_minutes: number;
        maps_url: string;
        voters: {
          order: number;
          address: string;
          voter_name: string;
          party: string;
          voter_status: string;
          age: number;
          talking_points: string[];
          [k: string]: unknown;
        }[];
        [k: string]: unknown;
      }[];
      methodology: string;
      [k: string]: unknown;
    };
  };
}
export interface DistrictIssuePulse {
  generated_at: string;
  state: string;
  city: string;
  l2_district_type: string;
  l2_district_name: string;
  total_active_voters: number;
  /**
   * @minItems 5
   * @maxItems 5
   */
  top_issues: [
    {
      rank: number;
      issue_label: string;
      hs_column: string;
      voter_count: number;
      voter_percentage: number;
      news: {
        source_name: string;
        url: string;
        published_date?: string;
        summary: string;
      };
    },
    {
      rank: number;
      issue_label: string;
      hs_column: string;
      voter_count: number;
      voter_percentage: number;
      news: {
        source_name: string;
        url: string;
        published_date?: string;
        summary: string;
      };
    },
    {
      rank: number;
      issue_label: string;
      hs_column: string;
      voter_count: number;
      voter_percentage: number;
      news: {
        source_name: string;
        url: string;
        published_date?: string;
        summary: string;
      };
    },
    {
      rank: number;
      issue_label: string;
      hs_column: string;
      voter_count: number;
      voter_percentage: number;
      news: {
        source_name: string;
        url: string;
        published_date?: string;
        summary: string;
      };
    },
    {
      rank: number;
      issue_label: string;
      hs_column: string;
      voter_count: number;
      voter_percentage: number;
      news: {
        source_name: string;
        url: string;
        published_date?: string;
        summary: string;
      };
    }
  ];
}
