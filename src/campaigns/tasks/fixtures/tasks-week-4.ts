import { CampaignTask, CampaignTaskType } from '../campaignTasks.types'

const tasksWeek4: CampaignTask[] = [
  {
    id: 'b2d5f6a7-8c9d-4e0f-1a2b-3c4d5e6f7a8b',
    title: 'Schedule your 1 month to election persuasive text message',
    description: 'Build trust and persuade voters.',
    cta: 'Schedule',
    week: 4,
    flowType: CampaignTaskType.text,
    proRequired: true,
    defaultAiTemplateId: '6Adu3kct9uvZ0YNCXLPUvd',
  },
  {
    id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    title: 'Request to schedule your 1 month to election persuasive robocall',
    description: 'Build trust and persuade voters.',
    cta: 'Request',
    week: 4,
    flowType: CampaignTaskType.robocall,
    proRequired: true,
    defaultAiTemplateId: '452l4TPYpWdQZYxHHJsdUb',
  },
  {
    id: 'd1e2f3a4-b5c6-7d8e-9f0a-1b2c3d4e5f6a',
    title: 'Knock on doors to persuade voters',
    description: 'Build trust and persuade voters.',
    cta: 'Develop strategy',
    week: 4,
    flowType: CampaignTaskType.doorKnocking,
    proRequired: true,
    defaultAiTemplateId: 'wgbnDDTxrf8OrresVE1HU',
  },
  {
    id: 'd4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9a',
    title: 'Plan your persuasive phone banking campaign',
    description: 'Build trust and persuade voters.',
    cta: 'Develop strategy',
    week: 4,
    flowType: CampaignTaskType.phoneBanking,
    proRequired: true,
    defaultAiTemplateId: '5N93cglp3cvq62EIwu1IOa',
  },
  {
    id: '4b5c6d7e-8f9a-0b1c-2d3e-4f5a6b7c8d9e',
    title: 'Post to social media talking about one of your top voter issues',
    description: 'Tell people you have solutions for their issues.',
    cta: 'Write post',
    week: 4,
    flowType: CampaignTaskType.socialMedia,
    defaultAiTemplateId: 'Xboqgh6Ye3SgSwO6moujw',
  },
  {
    id: '4c5d6e7f-8g9h-0i1j-2k3l-4m5n6o7p8q9r',
    title: 'Turn support into victory',
    description:
      'Learn how to encourage your supporters to turn out to vote on election day.',
    cta: 'Learn more',
    week: 4,
    flowType: CampaignTaskType.education,
    link: 'https://goodparty.org/blog/article/turning-support-into-victory-vote-phase-of-a-political-campaign',
  },
]

export default tasksWeek4
