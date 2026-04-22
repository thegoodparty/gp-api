import { CampaignTaskTemplate, CampaignTaskType } from '../campaignTasks.types'

export const campaignFinanceAwarenessTask: Omit<CampaignTaskTemplate, 'week'> =
  {
    title: 'Add your campaign finance deadlines to your calendar',
    description:
      "Most campaigns have statutory requirements about when you have to submit your campaign finance report. Add those dates to your campaign calendar to ensure you don't miss the deadlines!",
    flowType: CampaignTaskType.awareness,
    isDefaultTask: true,
  }

export const metaVerifiedAwarenessTask: Omit<CampaignTaskTemplate, 'week'> = {
  title: 'Get Meta verified',
  description: 'Get identity verified on Meta to run advertising on FB and IG.',
  flowType: CampaignTaskType.awareness,
  isDefaultTask: true,
}

export const designMaterialsAwarenessTask: Omit<CampaignTaskTemplate, 'week'> =
  {
    title: 'Design materials',
    description:
      'Design materials such as yard signs, door hangers, palm cards, etc.',
    flowType: CampaignTaskType.awareness,
    isDefaultTask: true,
  }

export const primaryElectionDayAwarenessTask: Omit<
  CampaignTaskTemplate,
  'week'
> = {
  title: 'Primary Election Day',
  description:
    'Today is Election Day! Get out and vote, and make sure your supporters do too. Good luck!',
  flowType: CampaignTaskType.awareness,
  isDefaultTask: true,
}

export const generalElectionDayAwarenessTask: Omit<
  CampaignTaskTemplate,
  'week'
> = {
  title: 'General Election Day',
  description:
    'Today is Election Day! Get out and vote, and make sure your supporters do too. Good luck!',
  flowType: CampaignTaskType.awareness,
  isDefaultTask: true,
}

export const generalAwarenessTasks: CampaignTaskTemplate[] = [
  {
    title: 'Reach 10% of your Voter Contact Goal',
    description:
      'By this date, you should have hit 10% of your Voter Contact Goal across all available channels',
    flowType: CampaignTaskType.awareness,
    week: 10,
    isDefaultTask: true,
  },
  {
    title: 'Reach 25% of your fundraising goal',
    description:
      'By this date, you should have raised 25% of your overall campaign budget',
    flowType: CampaignTaskType.awareness,
    week: 9,
    isDefaultTask: true,
  },
  {
    title: 'Reach 25% of your Voter Contact Goal',
    description:
      'By this date, you should have hit 25% of your Voter Contact Goal across all available channels',
    flowType: CampaignTaskType.awareness,
    week: 8,
    isDefaultTask: true,
  },
  {
    title: 'Reach 50% of your fundraising goal',
    description:
      'By this date, you should have raised 50% of your overall campaign budget',
    flowType: CampaignTaskType.awareness,
    week: 7,
    isDefaultTask: true,
  },
  {
    title: 'Reach 50% of your Voter Contact Goal',
    description:
      'By this date, you should have hit 50% of your Voter Contact Goal across all available channels',
    flowType: CampaignTaskType.awareness,
    week: 6,
    isDefaultTask: true,
  },
  {
    title: 'Reach 75% of your fundraising goal',
    description:
      'By this date, you should have raised 75% of your overall campaign budget',
    flowType: CampaignTaskType.awareness,
    week: 5,
    isDefaultTask: true,
  },
  {
    title: 'Reach 75% of your Voter Contact Goal',
    description:
      'By this date, you should have hit 75% of your Voter Contact Goal across all available channels',
    flowType: CampaignTaskType.awareness,
    week: 4,
    isDefaultTask: true,
  },
  {
    title: 'Reach 100% of your fundraising goal',
    description:
      'By this date, you should have raised 100% of your overall campaign budget',
    flowType: CampaignTaskType.awareness,
    week: 3,
    isDefaultTask: true,
  },
  {
    title: 'Reach 100% of your Voter Contact Goal',
    description:
      'By this date, you should have hit 100% of your Voter Contact Goal across all available channels',
    flowType: CampaignTaskType.awareness,
    week: 2,
    isDefaultTask: true,
  },
]
