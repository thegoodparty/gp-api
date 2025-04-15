import { CampaignTask, CampaignTaskType } from '../campaignTasks.types'

const tasksWeek5: CampaignTask[] = [
  {
    id: '5c6d7e8f-9a0b-1c2d-3e4f-5a6b7c8d9e0f',
    title: 'Knock on doors to persuade voters',
    description: 'Build trust and persuade voters.',
    cta: 'Schedule',
    week: 5,
    flowType: CampaignTaskType.doorKnocking,
    proRequired: true,
    defaultAiTemplateId: 'wgbnDDTxrf8OrresVE1HU',
  },
  {
    id: '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
    title: 'Plan your persuasive phone banking campaign',
    description: 'Build trust and persuade voters.',
    cta: 'Develop strategy',
    week: 5,
    flowType: CampaignTaskType.phoneBanking,
    proRequired: true,
    defaultAiTemplateId: '5N93cglp3cvq62EIwu1IOa',
  },
  {
    id: '7e8f9a0b-1c2d-3e4f-5a6b-7c8d9e0f1a2b',
    title: 'Post to social media talking about one of your top voter issues',
    description: 'Tell people you have solutions for their issues.',
    cta: 'Write Post',
    week: 5,
    flowType: CampaignTaskType.socialMedia,
    defaultAiTemplateId: 'Xboqgh6Ye3SgSwO6moujw',
  },
  {
    id: '3c4d5e6f-7a8b-9c0d-1e2f-3a4b5c6d7e8f',
    title: 'Plan to attend a debate',
    description: 'Figure out when the debate is and put it on your calendar.',
    cta: 'Get Guidance',
    week: 5,
    flowType: CampaignTaskType.events,
    link: 'https://goodparty.org/blog/article/10-tips-to-prepare-for-first-candidate-debate',
  },
]

export default tasksWeek5
