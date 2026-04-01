import { proxyActivities } from '@temporalio/workflow'
import type * as activities from '../activities/poll.activities'

const {
  getOrCreateCsv,
  createPollMessages,
  sendSlackNotification,
  executePollExpansion,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  retry: {
    maximumAttempts: 3,
  },
})

export const pollCreationWorkflow = async (
  pollId: string,
): Promise<{ success: boolean; pollId: string }> => {
  const csv = await getOrCreateCsv(pollId)
  if (!csv) return { success: true, pollId }

  await createPollMessages(pollId, csv)
  await sendSlackNotification(pollId, csv, false)

  return { success: true, pollId }
}

export const pollExpansionWorkflow = async (
  pollId: string,
): Promise<{ success: boolean; pollId: string }> => {
  await executePollExpansion(pollId)
  return { success: true, pollId }
}
