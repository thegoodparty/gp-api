import { CampaignTask, CampaignTaskType } from '../campaignTasks.types'

export const defaultTasks: CampaignTask[] = [
  {
    title: 'Review and complete your profile',
    description: 'A crucial step to build your campaign platform.',
    cta: 'Review',
    flowType: CampaignTaskType.profile,
  },
  {
    title: 'Join the GoodParty.org community',
    description: 'Connect and learn from other Independent winners.',
    cta: 'Join',
    flowType: CampaignTaskType.externalLink,
    link: 'https://goodpartyorg.circle.so/join?invitation_token=ee5c167c12e1335125a5c8dce7c493e95032deb7-a58159ab-64c4-422a-9396-b6925c225952',
  },
  {
    title: 'Take the "How to run and win" course',
    description: 'An in depth course in how to run a successful campaign.',
    cta: 'Take the course',
    flowType: CampaignTaskType.externalLink,
    link: 'https://goodparty.org/blog/section/for-candidates',
  },
  {
    title: 'How to win a local election',
    description: 'Insights from 273 winners.',
    cta: 'Learn more',
    flowType: CampaignTaskType.general,
    link: 'https://www.goodparty.org/how-to-win-a-local-election',
  },

  {
    title: 'Schedule your election day reminder robocall',
    description: 'Encourage people to get out and vote.',
    cta: 'Schedule',
    flowType: CampaignTaskType.robocall,
  },
  {
    title: 'Create a website for your campaign',
    description: 'A website is a great way to connect with voters.',
    cta: 'Create',
    flowType: CampaignTaskType.website,
  },
  {
    title: 'Post to social media talking about one of your top voter issues',
    description: 'Tell people you have solutions for their issues.',
    cta: 'Write post',
    flowType: CampaignTaskType.socialMedia,
  },
  {
    title: 'Knock on doors to persuade voters',
    description: 'Build trust and persuade voters.',
    cta: 'Develop strategy',
    flowType: CampaignTaskType.doorKnocking,
  },
]
