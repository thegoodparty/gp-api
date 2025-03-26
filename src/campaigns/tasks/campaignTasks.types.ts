enum CampaignTaskType {
  texting = 'texting',
  robocall = 'robocall',
  doorKnocking = 'door-knocking',
  phoneBanking = 'phone-banking',
  link = 'link',
}

type CampaignTask = {
  id: string
  title: string
  description: string
  flowType: CampaignTaskType
  week: number
  link?: string
  proRequired?: boolean
}
