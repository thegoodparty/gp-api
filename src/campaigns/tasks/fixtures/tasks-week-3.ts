import { CampaignTask, CampaignTaskType } from '../campaignTasks.types'

const tasksWeek3: CampaignTask[] = [
  {
    id: '9a5b1c2d-3e4f-5a6b-7c8d-9e0f1a2b3c4d',
    title: 'Knock on doors to persuade voters',
    description: 'Build trust and persuade voters.',
    cta: 'Schedule',
    week: 3,
    flowType: CampaignTaskType.doorKnocking,
    proRequired: true,
    defaultAiTemplateId: 'wgbnDDTxrf8OrresVE1HU',
  },
  {
    id: '4d5e6f7a-8b9c-0d1e-2f3a-4b5c6d7e8f9a',
    title: 'Plan your persuasive phone banking campaign',
    description: 'Build trust and persuade voters.',
    cta: 'Develop strategy',
    week: 3,
    flowType: CampaignTaskType.phoneBanking,
    proRequired: true,
    defaultAiTemplateId: '5N93cglp3cvq62EIwu1IOa',
  },
  {
    id: 'b0c1d2e3-f4a5-6b7c-8d9e-0f1a2b3c4d5e',
    title: 'Post to social media talking about one of your top voter issues',
    description: 'Tell people you have solutions for their issues.',
    cta: 'Write Post',
    week: 3,
    flowType: CampaignTaskType.socialMedia,
    defaultAiTemplateId: 'Xboqgh6Ye3SgSwO6moujw',
  },
]

export default tasksWeek3
