import { CampaignTask, CampaignTaskType } from '../campaignTasks.types'

export const defaultTasks: CampaignTask[] = [
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
    title: 'Schedule your 1 month to election persuasive robocall',
    description: 'Build trust and persuade voters.',
    cta: 'Schedule',
    week: 4,
    flowType: CampaignTaskType.robocall,
    proRequired: true,
    defaultAiTemplateId: '452l4TPYpWdQZYxHHJsdUb',
  },
]
