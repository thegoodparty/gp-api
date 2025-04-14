export enum CampaignTaskType {
  text = 'text',
  robocall = 'robocall',
  doorKnocking = 'doorKnocking',
  phoneBanking = 'phoneBanking',
  socialMedia = 'socialMedia',
  events = 'events',
  education = 'education',
}

export type CampaignTask = {
  id: string
  /** Task title */
  title: string
  /** Task description */
  description: string
  /** Task Button text to be presented to the user */
  cta: string
  /** Type of task - the flow the user will take*/
  flowType: CampaignTaskType
  /** Week number for the task to be shown in to user */
  week: number
  /** URL to link to if not a "flow" type of task */
  link?: string
  /** Whether the task requires a pro account */
  proRequired?: boolean
  /** Number of days before election, after which the task is no longer available */
  deadline?: number
  /** Whether to skip counting voter contacts for this task */
  skipVoterCount?: boolean
}
