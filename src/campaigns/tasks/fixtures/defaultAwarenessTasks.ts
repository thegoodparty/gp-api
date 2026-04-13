import { CampaignTaskTemplate, CampaignTaskType } from '../campaignTasks.types'

export const generalAwarenessTasks: CampaignTaskTemplate[] = [
  {
    id: 'aw-voter-10pct',
    title: 'Reach 10% of your Voter Contact Goal',
    description:
      'By this date, you should have hit 10% of your Voter Contact Goal across all available channels',
    flowType: CampaignTaskType.awareness,
    week: 10,
    isDefaultTask: true,
  },
  {
    id: 'aw-fundraising-25pct',
    title: 'Reach 25% of your fundraising goal',
    description:
      'By this date, you should have raised 25% of your overall campaign budget',
    flowType: CampaignTaskType.awareness,
    week: 9,
    isDefaultTask: true,
  },
  {
    id: 'aw-voter-25pct',
    title: 'Reach 25% of your Voter Contact Goal',
    description:
      'By this date, you should have hit 25% of your Voter Contact Goal across all available channels',
    flowType: CampaignTaskType.awareness,
    week: 8,
    isDefaultTask: true,
  },
  {
    id: 'aw-fundraising-50pct',
    title: 'Reach 50% of your fundraising goal',
    description:
      'By this date, you should have raised 50% of your overall campaign budget',
    flowType: CampaignTaskType.awareness,
    week: 7,
    isDefaultTask: true,
  },
  {
    id: 'aw-voter-50pct',
    title: 'Reach 50% of your Voter Contact Goal',
    description:
      'By this date, you should have hit 50% of your Voter Contact Goal across all available channels',
    flowType: CampaignTaskType.awareness,
    week: 6,
    isDefaultTask: true,
  },
  {
    id: 'aw-fundraising-75pct',
    title: 'Reach 75% of your fundraising goal',
    description:
      'By this date, you should have raised 75% of your overall campaign budget',
    flowType: CampaignTaskType.awareness,
    week: 5,
    isDefaultTask: true,
  },
  {
    id: 'aw-voter-75pct',
    title: 'Reach 75% of your Voter Contact Goal',
    description:
      'By this date, you should have hit 75% of your Voter Contact Goal across all available channels',
    flowType: CampaignTaskType.awareness,
    week: 4,
    isDefaultTask: true,
  },
  {
    id: 'aw-fundraising-100pct',
    title: 'Reach 100% of your fundraising goal',
    description:
      'By this date, you should have raised 100% of your overall campaign budget',
    flowType: CampaignTaskType.awareness,
    week: 3,
    isDefaultTask: true,
  },
  {
    id: 'aw-voter-100pct',
    title: 'Reach 100% of your Voter Contact Goal',
    description:
      'By this date, you should have hit 100% of your Voter Contact Goal across all available channels',
    flowType: CampaignTaskType.awareness,
    week: 2,
    isDefaultTask: true,
  },
]
