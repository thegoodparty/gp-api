export enum CampaignTaskType {
  text = 'text',
  robocall = 'robocall',
  doorKnocking = 'doorKnocking',
  phoneBanking = 'phoneBanking',
  socialMedia = 'socialMedia',
  events = 'events',
  education = 'education',
  compliance = 'compliance',
}

export type CampaignTask = {
  id: string
  title: string
  description: string
  cta: string
  flowType: CampaignTaskType
  week: number
  date?: string
  link?: string
  proRequired?: boolean
  isDefaultTask?: boolean
  deadline?: number
  /** CMS ID of the default AI template to use for the task */
  defaultAiTemplateId?: string
}
