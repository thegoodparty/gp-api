import { CampaignTask, CampaignTaskType } from '../campaignTasks.types'

const tasksWeek7: CampaignTask[] = [
  {
    id: '7a8b9c0d-1e2f-3g4h-5i6j-7k8l9m0n1o2p',
    title: 'Knock on doors to get to know your voters',
    description: 'Learn about their top issues.',
    cta: 'Develop strategy',
    week: 7,
    flowType: CampaignTaskType.doorKnocking,
    proRequired: true,
    defaultAiTemplateId: '5jrvZCd28PMH4ipYl9DzTB',
  },
  {
    id: '7b8c9d0e-1f2g-3h4i-5j6k-7l8m9n0o1p2q',
    title: 'Plan a phone banking campaign to get to know your voters',
    description: 'Learn about their top issues.',
    cta: 'Develop strategy',
    week: 7,
    flowType: CampaignTaskType.phoneBanking,
    proRequired: true,
    defaultAiTemplateId: '2QCSobc5r6R7gO5hb0i8Ho',
  },
  {
    id: '7c8d9e0f-1g2h-3i4j-5k6l-7m8n9o0p1q2r',
    title: 'Post to social media talking about your local community',
    description:
      'Get to know who your voters are and show them you are active in the community.',
    cta: 'Write post',
    week: 7,
    flowType: CampaignTaskType.socialMedia,
    defaultAiTemplateId: 'NogRPt7eIxTU3ZEIw87LA',
  },
]

export default tasksWeek7
