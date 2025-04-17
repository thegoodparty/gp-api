import { CampaignTask, CampaignTaskType } from '../campaignTasks.types'

const tasksWeek9: CampaignTask[] = [
  {
    id: '9a1b2c3d-4e5f-6g7h-8i9j-0k1l2m3n4o5p',
    title: 'Review and complete your profile',
    description: 'A crucial step to build your campaign platform.',
    cta: 'Review',
    week: 9,
    flowType: CampaignTaskType.education,
    link: '/dashboard/campaign-details',
  },
  {
    id: '9b2c3d4e-5f6g-7h8i-9j0k-1l2m3n4o5p6q',
    title: 'Join the GoodParty.org community',
    description: 'Connect and learn from other Independent winners.',
    cta: 'Join',
    week: 9,
    flowType: CampaignTaskType.education,
    link: 'https://goodpartyorg.circle.so/join?invitation_token=cf9d15f0fb50e79770bc6f740406f63580acf703-5834c6b1-be0e-455f-bb7c-5cbc8049fa76',
  },
  {
    id: '9c3d4e5f-6g7h-8i9j-0k1l-2m3n4o5p6q7r',
    title: 'Take the "How to run and win" course',
    description: 'An in depth course in how to run a successful campaign.',
    cta: 'Take the course',
    week: 9,
    flowType: CampaignTaskType.education,
    link: 'https://goodpartyorg.circle.so/join?invitation_token=69acce7e89a1064e0fb78bb263ae0630a9d49569-fbb6cc8c-076e-44e6-a359-c0e95ec6d0a5',
  },
  {
    id: '9d4e5f6g-7h8i-9j0k-1l2m-3n4o5p6q7r8s',
    title: 'How to win a local election',
    description: 'Insights from 273 winners.',
    cta: 'Learn more',
    week: 9,
    flowType: CampaignTaskType.education,
    link: 'https://goodparty.org/blog/article/how-to-win-local-election',
  },
  {
    id: '9e5f6g7h-8i9j-0k1l-2m3n-4o5p6q7r8s9t',
    title: 'How to build your campaign platform',
    description:
      'A detailed guide on how to build a platform that resonates with voters.',
    cta: 'Learn more',
    week: 9,
    flowType: CampaignTaskType.education,
    link: 'https://goodparty.org/blog/article/how-to-build-campaign-platform-independent',
  },
  {
    id: '9f6g7h8i-9j0k-1l2m-3n4o-5p6q7r8s9t0u',
    title: 'Establish your brand and build initial support',
    description:
      'Learn how to connect with core supporters and build awareness around your campaign.',
    cta: 'Learn more',
    week: 9,
    flowType: CampaignTaskType.education,
    link: 'https://goodparty.org/blog/article/setting-the-stage-awareness-phase-of-political-campaigns',
  },
]

export default tasksWeek9
