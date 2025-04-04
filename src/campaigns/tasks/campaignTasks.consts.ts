import tasksWeek1 from './fixtures/tasks-week-1.json'
import tasksWeek2 from './fixtures/tasks-week-2.json'
import tasksWeek3 from './fixtures/tasks-week-3.json'
import tasksWeek4 from './fixtures/tasks-week-4.json'
import tasksWeek5 from './fixtures/tasks-week-5.json'
import tasksWeek6 from './fixtures/tasks-week-6.json'
import tasksWeek7 from './fixtures/tasks-week-7.json'
import tasksWeek8 from './fixtures/tasks-week-8.json'

export const STATIC_CAMPAIGN_TASKS = [
  ...tasksWeek1,
  ...tasksWeek2,
  ...tasksWeek3,
  ...tasksWeek4,
  ...tasksWeek5,
  ...tasksWeek6,
  ...tasksWeek7,
  ...tasksWeek8,
] as CampaignTask[]
