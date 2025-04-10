import { CampaignTask, CampaignTaskType } from '../campaignTasks.types'

const tasksWeek2: CampaignTask[] = [
  {
    id: 'f58b4523-c36d-4a5b-9e5f-88e4d3a7c70c',
    title: 'Schedule your persuasive text message',
    description: 'Build trust and persuade voters.',
    cta: 'Schedule',
    week: 2,
    flowType: CampaignTaskType.texting,
    proRequired: true,
  },
  {
    id: 'a5f07d6c-8e3d-49e2-b131-92103c2be07e',
    title: 'Schedule your persuasive robocall',
    description: 'Build trust and persuade voters.',
    cta: 'Schedule',
    week: 2,
    flowType: CampaignTaskType.robocall,
    proRequired: true,
  },
  {
    id: 'd92e5b8c-7ac0-4e1a-9b87-562f5824dfe9',
    title: 'Knock on doors to remind people to vote',
    description: 'Encourage people to get out and vote.',
    cta: 'Schedule',
    week: 2,
    flowType: CampaignTaskType.doorKnocking,
    proRequired: true,
  },
  {
    id: 'b41c6e7f-29e8-438d-89d3-6ed28742c4a5',
    title: 'Plan your phone banking campaign reminding people to vote',
    description: 'Encourage people to get out and vote.',
    cta: 'Develop strategy',
    week: 2,
    flowType: CampaignTaskType.phoneBanking,
    proRequired: true,
  },
  {
    id: 'e718329f-8b47-4e18-9f3b-8c7dfa96021c',
    title: 'Post to social media answering common questions',
    description:
      'Mobilize your base and control the narrative about your campaign.',
    cta: 'Write Post',
    week: 2,
    flowType: CampaignTaskType.socialMedia,
  },
  {
    id: '17a6ceb8-5f9d-4e83-80c7-2f8e41736104',
    title: 'Plan a GOTV event',
    description: 'Last opportunity to mobilize your volunteers and voters.',
    cta: 'Get Guidance',
    week: 2,
    flowType: CampaignTaskType.event,
    link: 'https://goodparty.org/blog/article/how-to-organize-campaign-events',
  },
]

export default tasksWeek2
