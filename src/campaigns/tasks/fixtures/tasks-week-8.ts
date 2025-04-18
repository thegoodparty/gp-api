import { CampaignTask, CampaignTaskType } from '../campaignTasks.types'

const tasksWeek8: CampaignTask[] = [
  {
    id: '1e2f3a4b-5c6d-7e8f-9a0b-1c2d3e4f5a6b',
    title: 'Knock on doors to get to know your voters',
    description: 'Learn about their top issues.',
    cta: 'Develop strategy',
    week: 8,
    flowType: CampaignTaskType.doorKnocking,
    proRequired: true,
    defaultAiTemplateId: '5jrvZCd28PMH4ipYl9DzTB',
  },
  {
    id: '7c8d9e0f-1a2b-3c4d-5e6f-7a8b9c0d1e2f',
    title: 'Plan a phone banking campaign to get to know your voters',
    description: 'Learn about their top issues.',
    cta: 'Develop strategy',
    week: 8,
    flowType: CampaignTaskType.phoneBanking,
    proRequired: true,
    defaultAiTemplateId: '2QCSobc5r6R7gO5hb0i8Ho',
  },
  {
    id: '3a4b5c6d-7e8f-9a0b-1c2d-3e4f5a6b7c8d',
    title: 'Post to social media talking about your local community',
    description:
      'Get to know who your voters are and show them you are active in the community.',
    cta: 'Write Post',
    week: 8,
    flowType: CampaignTaskType.socialMedia,
    defaultAiTemplateId: 'NogRPt7eIxTU3ZEIw87LA',
  },
  {
    id: '9e0f1a2b-3c4d-5e6f-7a8b-9c0d1e2f3a4b',
    title: 'Hold a volunteering event',
    description:
      'Start to recruit volunteers to help spread the word about your candidacy.',
    cta: 'Get Guidance',
    week: 8,
    flowType: CampaignTaskType.events,
    link: 'https://goodparty.org/blog/article/volunteers-bridging-campaign-constituent',
  },
  {
    id: '8d7e6f5a-4b3c-2d1e-0f9g-8h7i6j5k4l3m',
    title: 'Make genuine connections with voters',
    description:
      'Learn how to engage voters and grow support for your campaign.',
    cta: 'Learn More',
    week: 8,
    flowType: CampaignTaskType.education,
    link: 'https://goodparty.org/blog/article/engaging-voters-contact-phase-of-a-political-campaign',
  },
]

export default tasksWeek8
