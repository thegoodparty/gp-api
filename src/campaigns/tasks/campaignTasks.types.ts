export enum CampaignTaskType {
  texting = 'texting',
  robocall = 'robocall',
  doorKnocking = 'door-knocking',
  phoneBanking = 'phone-banking',
  socialMedia = 'social-media',
  events = 'events',
}

export type CampaignTask = {
  id: string
  title: string
  description: string
  cta: string
  flowType: CampaignTaskType
  week: number
  link?: string
  proRequired?: boolean
  deadline?: number // days before election, after which the task is no longer available
}
