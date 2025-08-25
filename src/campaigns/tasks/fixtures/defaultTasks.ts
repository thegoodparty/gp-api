import { CampaignTask, CampaignTaskType } from '../campaignTasks.types'

export const defaultTasks: CampaignTask[] = [
  {
    id: 'default-b2d5f6a7-8c9d-4e0f-1a2b-3c4d5e6f7a8b',
    title: 'Review and complete your profile',
    description: 'A crucial step to build your campaign platform.',
    cta: 'Review profile',
    week: 205, // so it's always the first task
    flowType: CampaignTaskType.education,
    link: '/dashboard/campaign-details',
  },
  {
    id: 'default-f47ac10b-58cc-4372-a567-0e02b2c3d479',
    title: 'Create your free website',
    description:
      'Launch a professional website in just 10 minutes to showcase your campaign, connect with voters, and share your vision for the community.',
    cta: 'Create website',
    week: 204,
    flowType: CampaignTaskType.education,
    link: '/dashboard/website',
  },
  {
    id: 'default-f47ac10b-58cc-4372-a567-1asd54d7',
    title: 'Share your website with 5 voters you know',
    description:
      'Take your first step in voter outreach and get your campaign moving.',
    cta: 'Begin outreach',
    week: 203,
    flowType: CampaignTaskType.education,
  },
  {
    id: 'default-oiusn2-58cc-4372-a567-1asd54d7',
    title: 'Take the "How to run and win" course',
    description: 'Learn how to run a successful campaign.',
    cta: 'Take the course',
    week: 202,
    flowType: CampaignTaskType.education,
    link: 'https://goodpartyorg.circle.so/join?invitation_token=ee5c167c12e1335125a5c8dce7c493e95032deb7-a58159ab-64c4-422a-9396-b6925c225952',
  },
]
