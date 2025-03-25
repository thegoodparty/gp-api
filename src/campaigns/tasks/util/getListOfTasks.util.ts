import { STATIC_CAMPAIGN_TASKS } from '../campaignTasks.consts'

export const getListOfTasks = (weekN?: number) =>
  weekN
    ? STATIC_CAMPAIGN_TASKS.filter(({ week }) => week === weekN)
    : STATIC_CAMPAIGN_TASKS
