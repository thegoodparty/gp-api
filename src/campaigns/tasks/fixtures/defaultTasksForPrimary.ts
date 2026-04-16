import { CampaignTaskTemplate, CampaignTaskType } from '../campaignTasks.types'

// id mapping to content: https://gp-api.goodparty.org/v1/content/type/aiContentCategories

export const primaryDefaultTasks: CampaignTaskTemplate[] = [
  {
    title: 'Introduction Text',
    description: 'Introduce yourself to voters',
    cta: 'Schedule',
    week: 4,
    flowType: CampaignTaskType.text,
    proRequired: true,
    defaultAiTemplateId: 'SItaOVImzRCUFi0J2kVXK',
    isDefaultTask: true,
  },
  {
    title: 'Introduction Robocall',
    description: 'Introduce yourself to voters',
    cta: 'Request',
    week: 4,
    flowType: CampaignTaskType.robocall,
    proRequired: true,
    defaultAiTemplateId: '76PHFEODDtOxUs30CjsEI9',
    isDefaultTask: true,
  },

  {
    title: 'Persuasion Text',
    description: 'Build trust and persuade voters to vote for you',
    cta: 'Schedule',
    week: 2,
    flowType: CampaignTaskType.text,
    proRequired: true,
    defaultAiTemplateId: '5NbCRs4cIhti8pxnI8IM0P',
    isDefaultTask: true,
  },
  {
    title: 'Persuasion Robocall',
    description: 'Build trust and persuade voters to vote for you',
    cta: 'Request',
    week: 2,
    flowType: CampaignTaskType.robocall,
    proRequired: true,
    defaultAiTemplateId: '6ZH4tMYcZNXshFOcLtjMJB',
    isDefaultTask: true,
  },

  {
    title: 'Early Voting Text',
    description: 'Encourage voters to vote early',
    cta: 'Schedule',
    week: 2,
    flowType: CampaignTaskType.text,
    proRequired: true,
    defaultAiTemplateId: '5bdl7r7NFspfYc2Niwxc7j',
    isDefaultTask: true,
  },
  {
    title: 'Primary Day Reminder Robocall',
    description: 'Get out the vote on Primary Day',
    cta: 'Request',
    week: 1,
    flowType: CampaignTaskType.robocall,
    proRequired: true,
    defaultAiTemplateId: '2GMO6bQoQermNhdRmRe1fh',
    isDefaultTask: true,
  },
  {
    title: 'Primary Day Reminder Text',
    description: 'Get out the vote on Primary Day',
    cta: 'Schedule',
    week: 1,
    flowType: CampaignTaskType.text,
    proRequired: true,
    defaultAiTemplateId: '5b6W9pYlX796TBI2HV7HlQ',
    isDefaultTask: true,
  },
]
