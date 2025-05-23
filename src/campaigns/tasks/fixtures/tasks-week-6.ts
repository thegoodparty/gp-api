import { CampaignTask, CampaignTaskType } from '../campaignTasks.types'

const tasksWeek6: CampaignTask[] = [
  {
    id: '6a7b8c9d-0e1f-2g3h-4i5j-6k7l8m9n0o1p',
    title: 'Knock on doors to persuade voters',
    description: 'Build trust and persuade voters.',
    cta: 'Develop strategy',
    week: 6,
    flowType: CampaignTaskType.doorKnocking,
    proRequired: true,
    defaultAiTemplateId: 'wgbnDDTxrf8OrresVE1HU',
  },
  {
    id: '5e6f7a8b-9c0d-1e2f-3a4b-5c6d7e8f9a0b',
    title: 'Plan your persuasive phone banking campaign',
    description: 'Build trust and persuade voters.',
    cta: 'Develop strategy',
    week: 6,
    flowType: CampaignTaskType.phoneBanking,
    proRequired: true,
    defaultAiTemplateId: '5N93cglp3cvq62EIwu1IOa',
  },
  {
    id: '1c2d3e4f-5a6b-7c8d-9e0f-1a2b3c4d5e6f',
    title: 'Post your event calendar to social media',
    description: 'Tell everyone what you have going on',
    cta: 'Write post',
    week: 6,
    flowType: CampaignTaskType.socialMedia,
    defaultAiTemplateId: '3nr6D5fpYfIfywijoE1ITH',
  },
  {
    id: '6d7e8f9a-0b1c-2d3e-4f5g-6h7i8j9k0l1m',
    title: 'Attend a town hall meeting',
    description:
      'Make relationships with people currently working in local government.',
    cta: 'Get guidance',
    week: 6,
    flowType: CampaignTaskType.events,
    link: 'https://goodparty.org/blog/article/town-hall-meetings',
  },
]

export default tasksWeek6
