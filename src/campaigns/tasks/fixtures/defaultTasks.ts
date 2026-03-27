import {
  CampaignTask,
  CampaignTaskType,
  ElectionPhase,
} from '../campaignTasks.types'

// id mapping to content: https://gp-api.goodparty.org/v1/content/type/aiContentCategories

export function getDefaultTasks(phase: ElectionPhase): CampaignTask[] {
  const dayLabel = phase === 'primary' ? 'Primary Day' : 'Election Day'

  return [
    {
      id: 'b2d5f6a7-8c9d-4e0f-1a2b-3c4d5e6f7a8b',
      title: 'Schedule your 1 month to election persuasive text message',
      description: 'Build trust and persuade voters.',
      cta: 'Schedule',
      week: 4,
      flowType: CampaignTaskType.text,
      proRequired: true,
      defaultAiTemplateId: '6Adu3kct9uvZ0YNCXLPUvd',
      isDefaultTask: true,
    },
    {
      id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      title: 'Request to schedule your 1 month to election persuasive robocall',
      description: 'Build trust and persuade voters.',
      cta: 'Request',
      week: 4,
      flowType: CampaignTaskType.robocall,
      proRequired: true,
      defaultAiTemplateId: '452l4TPYpWdQZYxHHJsdUb',
      isDefaultTask: true,
    },

    {
      id: 'f58b4523-c36d-4a5b-9e5f-88e4d3a7c70c',
      title: 'Schedule your persuasive text message',
      description: 'Build trust and persuade voters.',
      cta: 'Schedule',
      week: 2,
      flowType: CampaignTaskType.text,
      proRequired: true,
      defaultAiTemplateId: '5NbCRs4cIhti8pxnI8IM0P',
      isDefaultTask: true,
    },
    {
      id: 'a5f07d6c-8e3d-49e2-b131-92103c2be07e',
      title: 'Request to schedule your persuasive robocall',
      description: 'Build trust and persuade voters.',
      cta: 'Request',
      week: 2,
      flowType: CampaignTaskType.robocall,
      proRequired: true,
      defaultAiTemplateId: '6ZH4tMYcZNXshFOcLtjMJB',
      isDefaultTask: true,
    },

    {
      id: '41b8b290-7e50-4d5a-8c9f-b8e17b253cde',
      title: `Schedule your ${dayLabel} reminder text message`,
      description: 'Encourage people to get out and vote.',
      cta: 'Schedule',
      week: 1,
      flowType: CampaignTaskType.text,
      deadline: 3,
      proRequired: true,
      defaultAiTemplateId: '5b6W9pYlX796TBI2HV7HlQ',
      isDefaultTask: true,
    },
    {
      id: '5fc21abd-2792-4c09-96f1-de94a28b2b3c',
      title: `Request to schedule your ${dayLabel} reminder robocall`,
      description: 'Encourage people to get out and vote.',
      cta: 'Request',
      week: 1,
      flowType: CampaignTaskType.robocall,
      deadline: 3,
      proRequired: true,
      defaultAiTemplateId: '2GMO6bQoQermNhdRmRe1fh',
      isDefaultTask: true,
    },
  ]
}
