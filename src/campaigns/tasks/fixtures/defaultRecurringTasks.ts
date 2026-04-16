import { CampaignTaskType, RecurringTaskTemplate } from '../campaignTasks.types'

export const defaultRecurringTasks: RecurringTaskTemplate[] = [
  {
    title: 'Plan and Schedule 2 Social Posts for the week',
    description:
      'Keep your campaign visible! Plan and schedule two social posts to engage supporters and reach more voters.',
    recurrence: { type: 'weekly', dayOfWeek: 5 },
  },
  {
    title: 'Social media update',
    description:
      'Post campaign activities and photos on your social media channel of choice',
    recurrence: { type: 'weekly', dayOfWeek: 5 },
  },
  {
    title: 'Fundraising ask',
    description:
      'Make a fundraising solicitation (email and/or social media) to close out the month strong',
    recurrence: { type: 'weekly', dayOfWeek: 5 },
  },
  {
    title: 'Email update',
    description: 'Send a campaign progress update to your email contacts',
    recurrence: { type: 'weekly', dayOfWeek: 5 },
  },
  {
    title: 'Organize a House Party with Supporters',
    description:
      'Work with your supporters to organize an informational house party where you can talk to voters directly.',
    recurrence: { type: 'monthlyNthDay', dayOfWeek: 3, occurrences: [1] },
  },
  {
    title: 'Organize a Fundraiser',
    description:
      'Work with your supporters to plan and organize a fundraiser to get the financial support you need',
    recurrence: { type: 'monthlyNthDay', dayOfWeek: 2, occurrences: [2, 4] },
  },
  {
    title: 'Organize a Volunteer Voter Contact Event',
    description:
      'Give your supporters a way to give back! Plan a volunteer voter contact event',
    recurrence: { type: 'monthlyNthDay', dayOfWeek: 2, occurrences: [2, 4] },
  },
  {
    title: 'Hold a Volunteer Voter Contact Event',
    description:
      'Put your plan into action! Bring volunteers together to connect with voters and build momentum for your campaign.',
    recurrence: { type: 'monthlyNthDay', dayOfWeek: 2, occurrences: [1, 3] },
  },
  {
    title: 'Submit 2 Letters to the Editor in support of your campaign',
    description:
      'Have some of your supporters write some Letters to the Editor in support of your campaign to the local press.',
    recurrence: { type: 'weeksBeforeElection', dayOfWeek: 4, weeksBefore: 4 },
  },
  {
    title: 'Knock on Doors',
    description:
      'Keep your campaign on track to hit your voter contact goals. Knock on your target doors to connect with voters face-to-face.',
    recurrence: { type: 'weekly', dayOfWeek: 5 },
    flowType: CampaignTaskType.doorKnocking,
    proRequired: true,
    defaultAiTemplateId: 'wgbnDDTxrf8OrresVE1HU',
  },
  {
    title: 'Make phone bank calls',
    description:
      'Keep your campaign on track to hit your voter contact goals. Complete a phone bank shift to reach voters and share your message.',
    recurrence: { type: 'weekly', dayOfWeek: 5 },
    flowType: CampaignTaskType.phoneBanking,
    proRequired: true,
    defaultAiTemplateId: '5N93cglp3cvq62EIwu1IOa',
  },
]
