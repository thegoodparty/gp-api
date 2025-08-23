export enum CampaignTaskType {
  text = 'text',
  robocall = 'robocall',
  doorKnocking = 'doorKnocking',
  phoneBanking = 'phoneBanking',
  socialMedia = 'socialMedia',
  externalLink = 'externalLink',
  general = 'general',
  website = 'website',
  compliance = 'compliance',
  upgradeToPro = 'upgradeToPro',
  profile = 'profile',
}

export type CampaignTask = {
  /** Task title */
  title: string
  /** Task description */
  description: string
  /** Task Button text to be presented to the user */
  cta: string
  /** Type of task - the flow the user will take*/
  flowType: CampaignTaskType
  /** URL to link to if not a "flow" type of task */
  link?: string
}
