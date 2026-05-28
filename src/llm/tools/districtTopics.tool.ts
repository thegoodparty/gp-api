import { z } from 'zod'
import type { LlmStreamTool } from '@/llm/services/llm.service'

export interface CatalogColumn {
  name: string
  meaning: string
}

export interface CatalogTopic {
  description: string
  columns: CatalogColumn[]
}

export const DISTRICT_TOPICS_CATALOG: Record<string, CatalogTopic> = {
  housing: {
    description:
      'Housing affordability, gentrification views, homeownership status',
    columns: [
      {
        name: 'hs_affordable_housing_gov_has_role',
        meaning: 'agrees government has a role in affordable housing',
      },
      {
        name: 'hs_affordable_housing_gov_no_role',
        meaning: 'opposes government role in affordable housing',
      },
      { name: 'hs_gentrification_support', meaning: 'supports gentrification' },
      { name: 'hs_gentrification_oppose', meaning: 'opposes gentrification' },
      { name: 'hs_new_home_buyer', meaning: 'recently bought a home' },
      { name: 'hs_any_home_buyer', meaning: 'has ever bought a home' },
    ],
  },
  taxes: {
    description: 'Tax cuts, gas tax, social security tax, minimum wage',
    columns: [
      { name: 'hs_tax_cuts_support', meaning: 'supports tax cuts' },
      { name: 'hs_tax_cuts_oppose', meaning: 'opposes tax cuts' },
      { name: 'hs_gas_tax_support', meaning: 'supports the gas tax' },
      { name: 'hs_gas_tax_oppose', meaning: 'opposes the gas tax' },
      {
        name: 'hs_social_security_tax_increase_support',
        meaning: 'supports raising social security taxes',
      },
      {
        name: 'hs_social_security_tax_increase_oppose',
        meaning: 'opposes raising social security taxes',
      },
      {
        name: 'hs_min_wage_15_increase_support',
        meaning: 'supports raising min wage to $15',
      },
      {
        name: 'hs_min_wage_15_increase_oppose',
        meaning: 'opposes raising min wage to $15',
      },
      {
        name: 'hs_ideology_fiscal_conserv',
        meaning: 'fiscally conservative ideology',
      },
      {
        name: 'hs_ideology_fiscal_liberal',
        meaning: 'fiscally liberal ideology',
      },
    ],
  },
  education: {
    description:
      'School choice, school funding, charter schools, teachers union views',
    columns: [
      { name: 'hs_school_choice_support', meaning: 'supports school choice' },
      { name: 'hs_school_choice_oppose', meaning: 'opposes school choice' },
      {
        name: 'hs_school_funding_more',
        meaning: 'favors more school funding',
      },
      {
        name: 'hs_school_funding_less',
        meaning: 'favors less school funding',
      },
      {
        name: 'hs_charter_schools_support',
        meaning: 'supports charter schools',
      },
      {
        name: 'hs_charter_schools_oppose',
        meaning: 'opposes charter schools',
      },
      {
        name: 'hs_teachers_union_positive',
        meaning: 'positive view of teachers unions',
      },
      {
        name: 'hs_teachers_union_negative',
        meaning: 'negative view of teachers unions',
      },
      {
        name: 'hs_community_college_free_support',
        meaning: 'supports free community college',
      },
      {
        name: 'hs_community_college_free_oppose',
        meaning: 'opposes free community college',
      },
    ],
  },
  healthcare: {
    description:
      'Medicaid expansion, Medicare for All, ACA, family medical leave, opioid policy',
    columns: [
      {
        name: 'hs_medicaid_expansion_support',
        meaning: 'supports medicaid expansion',
      },
      {
        name: 'hs_medicaid_expansion_oppose',
        meaning: 'opposes medicaid expansion',
      },
      {
        name: 'hs_medicare_for_all_support',
        meaning: 'supports Medicare for All',
      },
      {
        name: 'hs_medicare_for_all_oppose',
        meaning: 'opposes Medicare for All',
      },
      {
        name: 'hs_obamacare_aca_expand',
        meaning: 'supports expanding the ACA',
      },
      { name: 'hs_obamacare_aca_protect', meaning: 'supports protecting ACA' },
      { name: 'hs_obamacare_aca_oppose', meaning: 'opposes the ACA' },
      {
        name: 'hs_family_medical_leave_support',
        meaning: 'supports paid family/medical leave',
      },
      {
        name: 'hs_family_medical_leave_oppose',
        meaning: 'opposes paid family/medical leave',
      },
      {
        name: 'hs_opioid_crisis_treat',
        meaning: 'treats opioid crisis as a health issue',
      },
      {
        name: 'hs_opioid_crisis_enforce',
        meaning: 'treats opioid crisis as a law-enforcement issue',
      },
    ],
  },
  climate_energy: {
    description:
      'Climate change belief, electric vehicles, solar, fracking, federal lands, Green New Deal',
    columns: [
      {
        name: 'hs_climate_change_believer',
        meaning: 'believes in human-caused climate change',
      },
      {
        name: 'hs_climate_change_nonbeliever',
        meaning: 'rejects human-caused climate change',
      },
      {
        name: 'hs_electric_vehicle_likely_buyer',
        meaning: 'likely to buy an electric vehicle',
      },
      {
        name: 'hs_electric_vehicle_not_likely',
        meaning: 'unlikely to buy an electric vehicle',
      },
      { name: 'hs_solar_panel_buyer_yes', meaning: 'has bought solar panels' },
      {
        name: 'hs_solar_panel_buyer_no',
        meaning: 'has not bought solar panels',
      },
      {
        name: 'hs_pipeline_fracking_support',
        meaning: 'supports pipelines/fracking',
      },
      {
        name: 'hs_pipeline_fracking_oppose',
        meaning: 'opposes pipelines/fracking',
      },
      {
        name: 'hs_green_new_deal_support',
        meaning: 'supports the Green New Deal',
      },
      {
        name: 'hs_green_new_deal_oppose',
        meaning: 'opposes the Green New Deal',
      },
      {
        name: 'hs_sell_federal_lands_support',
        meaning: 'supports selling federal lands',
      },
      {
        name: 'hs_sell_federal_lands_oppose',
        meaning: 'opposes selling federal lands',
      },
    ],
  },
  immigration: {
    description: 'Mass deportations, border wall, immigration policy views',
    columns: [
      {
        name: 'hs_mass_deporations_support',
        meaning: 'supports mass deportations',
      },
      {
        name: 'hs_mass_deporations_oppose',
        meaning: 'opposes mass deportations',
      },
      { name: 'hs_mexican_wall_support', meaning: 'supports a border wall' },
      { name: 'hs_mexican_wall_oppose', meaning: 'opposes a border wall' },
      {
        name: 'hs_immigration_process_unfair',
        meaning: 'sees the immigration process as unfair',
      },
      {
        name: 'hs_immigration_undesirable',
        meaning: 'sees more immigration as undesirable',
      },
    ],
  },
  crime_safety: {
    description:
      'Violent crime concern, gun control, police trust, death penalty',
    columns: [
      {
        name: 'hs_violent_crime_very_worried',
        meaning: 'very worried about violent crime',
      },
      {
        name: 'hs_violent_crime_not_worried',
        meaning: 'not worried about violent crime',
      },
      { name: 'hs_gun_control_support', meaning: 'supports gun control' },
      { name: 'hs_gun_control_oppose', meaning: 'opposes gun control' },
      { name: 'hs_police_trust_yes', meaning: 'trusts the police' },
      { name: 'hs_police_trust_no', meaning: 'does not trust the police' },
      {
        name: 'hs_death_penalty_support',
        meaning: 'supports the death penalty',
      },
      { name: 'hs_death_penalty_oppose', meaning: 'opposes the death penalty' },
    ],
  },
  social_issues: {
    description:
      'Abortion, same-sex marriage, trans athletes, DEI, religion salience',
    columns: [
      { name: 'hs_abortion_pro_choice', meaning: 'pro-choice on abortion' },
      { name: 'hs_abortion_pro_life', meaning: 'pro-life on abortion' },
      {
        name: 'hs_same_sex_marriage_support',
        meaning: 'supports same-sex marriage',
      },
      {
        name: 'hs_same_sex_marriage_oppose',
        meaning: 'opposes same-sex marriage',
      },
      {
        name: 'hs_trans_athlete_yes',
        meaning: 'supports trans athlete participation',
      },
      {
        name: 'hs_trans_athlete_no',
        meaning: 'opposes trans athlete participation',
      },
      { name: 'hs_dei_support', meaning: 'supports DEI initiatives' },
      { name: 'hs_dei_oppose', meaning: 'opposes DEI initiatives' },
      {
        name: 'hs_religion_important',
        meaning: 'religion is important in their life',
      },
      {
        name: 'hs_religion_not_important',
        meaning: 'religion is not important in their life',
      },
    ],
  },
  regulation_economy: {
    description:
      'Views on regulation, capitalism, unions, income inequality, infrastructure spending',
    columns: [
      {
        name: 'hs_regulations_too_harsh',
        meaning: 'sees regulations as too harsh',
      },
      { name: 'hs_regulations_good', meaning: 'sees regulations as good' },
      {
        name: 'hs_capitalism_believe_sound',
        meaning: 'believes capitalism is fundamentally sound',
      },
      {
        name: 'hs_capitalism_believe_flawed',
        meaning: 'believes capitalism is fundamentally flawed',
      },
      { name: 'hs_unions_beneficial', meaning: 'views unions as beneficial' },
      {
        name: 'hs_unions_not_beneficial',
        meaning: 'views unions as not beneficial',
      },
      {
        name: 'hs_income_inequality_serious',
        meaning: 'sees income inequality as a serious problem',
      },
      {
        name: 'hs_income_inequality_no_issue',
        meaning: 'sees income inequality as not a real issue',
      },
      {
        name: 'hs_infrastructure_funding_fund_more',
        meaning: 'favors more infrastructure funding',
      },
      {
        name: 'hs_infrastructure_funding_enough_spent',
        meaning: 'believes enough is spent on infrastructure',
      },
    ],
  },
  turnout_propensity: {
    description: 'Likelihood of voting across election types and methods',
    columns: [
      {
        name: 'hs_likely_mid_term_voter',
        meaning: 'likely to vote in midterms',
      },
      {
        name: 'hs_likely_presidential_voter',
        meaning: 'likely to vote in presidential elections',
      },
      {
        name: 'hs_likely_polling_turnout',
        meaning: 'likely to physically show up at a polling place',
      },
      {
        name: 'hs_likely_ev',
        meaning: 'likely to vote early (in-person early voting)',
      },
      {
        name: 'hs_likely_vbm',
        meaning: 'likely to vote by mail (absentee ballot)',
      },
    ],
  },
  engagement: {
    description:
      'Responsiveness to outreach channels, donation likelihood, activism',
    columns: [
      {
        name: 'hs_responsiveness_sms',
        meaning: 'responsive to SMS / text outreach',
      },
      {
        name: 'hs_responsiveness_live',
        meaning: 'responsive to live phone or door-knock contact',
      },
      {
        name: 'hs_responsiveness_email',
        meaning: 'responsive to email outreach',
      },
      {
        name: 'hs_political_donations_likely',
        meaning: 'likely to donate to political causes',
      },
      {
        name: 'hs_political_donations_unlikely',
        meaning: 'unlikely to donate to political causes',
      },
      { name: 'hs_activism', meaning: 'engaged in activism' },
    ],
  },
  political_identity: {
    description:
      'Self-identified ideology, party strength, tribalism, ticket splitting',
    columns: [
      {
        name: 'hs_ideology_general_conservative',
        meaning: 'self-identifies as generally conservative',
      },
      {
        name: 'hs_ideology_general_moderate',
        meaning: 'self-identifies as generally moderate',
      },
      {
        name: 'hs_ideology_general_liberal',
        meaning: 'self-identifies as generally liberal',
      },
      {
        name: 'hs_ideology_overall_party_dem_strong',
        meaning: 'strong Democrat',
      },
      {
        name: 'hs_ideology_overall_party_gop_strong',
        meaning: 'strong Republican',
      },
      {
        name: 'hs_ideology_overall_party_indep',
        meaning: 'true independent',
      },
      { name: 'hs_tribalism_team_dem', meaning: 'team-Democrat tribalism' },
      { name: 'hs_tribalism_team_gop', meaning: 'team-Republican tribalism' },
      {
        name: 'hs_tribalism_open_minded',
        meaning: 'open-minded, low partisan tribalism',
      },
      {
        name: 'hs_ticket_splitter_yes',
        meaning: 'splits ticket across parties',
      },
      {
        name: 'hs_ticket_splitter_no',
        meaning: 'does not split ticket',
      },
    ],
  },
  trust: {
    description:
      'Trust in science, voting integrity, view of political opposition',
    columns: [
      {
        name: 'hs_trust_science_always',
        meaning: 'always or usually trusts scientific consensus',
      },
      {
        name: 'hs_trust_science_rarely',
        meaning: 'rarely trusts scientific consensus',
      },
      {
        name: 'hs_voting_fraud_concern_fraud',
        meaning: 'concerned about voter fraud',
      },
      {
        name: 'hs_voting_fraud_concern_oppression',
        meaning: 'concerned about voter suppression',
      },
      {
        name: 'hs_view_of_opposition_dangerous',
        meaning: 'sees political opposition as dangerous',
      },
      {
        name: 'hs_view_of_opposition_misinformed',
        meaning: 'sees political opposition as misinformed',
      },
      {
        name: 'hs_view_of_opposition_just_disagree',
        meaning: 'sees political opposition as just disagreeing',
      },
      {
        name: 'hs_conspiracy_believer',
        meaning: 'leans toward conspiracy theories',
      },
      {
        name: 'hs_conspiracy_nonbeliever',
        meaning: 'rejects conspiracy theories',
      },
    ],
  },
  media: {
    description: 'TV news preferences, social media + podcast consumption',
    columns: [
      {
        name: 'hs_tv_most_trusted_news_fox',
        meaning: 'trusts Fox most for TV news',
      },
      {
        name: 'hs_tv_most_trusted_news_cnn',
        meaning: 'trusts CNN most for TV news',
      },
      {
        name: 'hs_tv_most_trusted_news_msnbc',
        meaning: 'trusts MSNBC most for TV news',
      },
      {
        name: 'hs_tv_viewer_watch_any_tv',
        meaning: 'watches any TV regularly',
      },
      {
        name: 'hs_tv_viewer_watch_paid_streaming',
        meaning: 'watches paid streaming services',
      },
      {
        name: 'hs_social_media_user',
        meaning: 'active social media user',
      },
      {
        name: 'hs_social_media_user_no_or_infrequent',
        meaning: 'not an active social media user',
      },
      { name: 'hs_podcast_listener_yes', meaning: 'listens to podcasts' },
      {
        name: 'hs_podcast_listener_no',
        meaning: 'does not listen to podcasts',
      },
    ],
  },
  grouping_dimensions: {
    description:
      'Non-hs columns commonly used as GROUP BY keys to break down results by demographic / partisan slice',
    columns: [
      {
        name: 'Parties_Description',
        meaning:
          'party affiliation string (Democratic / Republican / Non-Partisan / etc.)',
      },
      {
        name: 'Voters_Age',
        meaning: 'integer age; bucket into bands in SQL if useful',
      },
      { name: 'Voters_Gender', meaning: 'reported gender (M / F)' },
      {
        name: 'Voters_VotingPerformanceEvenYearGeneral',
        meaning: 'rolled-up turnout-performance score for even-year generals',
      },
    ],
  },
}

const inputSchema = z.object({
  topic: z.string().optional(),
})

export interface ListDistrictTopicsInput {
  topic?: string
}

export interface ListDistrictTopicsOutput {
  topics: Array<{
    name: string
    description: string
    columns: CatalogColumn[]
  }>
  availableTopics: string[]
}

export const buildDistrictTopicsTool = (): LlmStreamTool<
  ListDistrictTopicsInput,
  ListDistrictTopicsOutput
> => ({
  description:
    'Discover the catalog of Haystaq constituent-data topics and their columns. Call this BEFORE district_insights when answering a question about how constituents feel — pick a topic (e.g. "housing", "healthcare", "taxes") to get the relevant column names + their meanings, then write a district_insights SQL query using those columns. Call with no topic to list everything.',
  inputSchema,
  execute: async ({ topic }) => {
    const availableTopics = Object.keys(DISTRICT_TOPICS_CATALOG)

    if (!topic) {
      const topics = Object.entries(DISTRICT_TOPICS_CATALOG).map(
        ([name, entry]) => ({
          name,
          description: entry.description,
          columns: entry.columns,
        }),
      )
      return { topics, availableTopics }
    }

    const key = topic.toLowerCase()
    const match = DISTRICT_TOPICS_CATALOG[key]
    if (!match) {
      return { topics: [], availableTopics }
    }
    return {
      topics: [
        {
          name: key,
          description: match.description,
          columns: match.columns,
        },
      ],
      availableTopics,
    }
  },
})
