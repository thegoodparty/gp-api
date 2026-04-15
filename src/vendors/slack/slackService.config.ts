import { SlackChannel } from './slackService.types'

export const SLACK_CHANNEL_IDS = {
  [SlackChannel.botDev]: {
    channelId: process.env.SLACK_BOT_DEV_CHANNEL_ID,
    channelToken: process.env.SLACK_BOT_DEV_CHANNEL_TOKEN,
  },
  [SlackChannel.userFeedback]: {
    channelId: process.env.SLACK_USER_FEEDBACK_CHANNEL_ID,
    channelToken: process.env.SLACK_USER_FEEDBACK_CHANNEL_TOKEN,
  },
  [SlackChannel.botAi]: {
    channelId: process.env.SLACK_BOT_AI_CHANNEL_ID,
    channelToken: process.env.SLACK_BOT_AI_CHANNEL_TOKEN,
  },
  [SlackChannel.botPolitics]: {
    channelId: process.env.SLACK_BOT_POLITICS_CHANNEL_ID,
    channelToken: process.env.SLACK_BOT_POLITICS_CHANNEL_TOKEN,
  },
  [SlackChannel.botFeedback]: {
    channelId: process.env.SLACK_BOT_FEEDBACK_CHANNEL_ID,
    channelToken: process.env.SLACK_BOT_FEEDBACK_CHANNEL_TOKEN,
  },
  [SlackChannel.bot10DlcCompliance]: {
    channelId: process.env.SLACK_BOT_10DLC_COMPLIANCE_CHANNEL_ID,
    channelToken: process.env.SLACK_BOT_10DLC_COMPLIANCE_CHANNEL_TOKEN,
  },
  [SlackChannel.botDeletions]: {
    channelId: process.env.SLACK_BOT_DELETIONS_CHANNEL_ID,
    channelToken: process.env.SLACK_BOT_DELETIONS_CHANNEL_TOKEN,
  },
  [SlackChannel.botTevynApi]: {
    channelId: process.env.SLACK_BOT_TEVYN_API_CHANNEL_ID,
    channelToken: process.env.SLACK_BOT_TEVYN_API_CHANNEL_TOKEN,
  },
  [SlackChannel.casClickupTasks]: {
    channelId: process.env.SLACK_CAS_CLICKUP_TASKS_CHANNEL_ID,
    channelToken: process.env.SLACK_CAS_CLICKUP_TASKS_CHANNEL_TOKEN,
  },
}
