import { SlackChannel } from './slackService.types'

export const SLACK_CHANNEL_IDS = {
  [SlackChannel.botDev]: {
    channelId: process.env.SLACK_BOT_DEV_CHANNEL_ID,
    channelToken: process.env.SLACK_BOT_DEV_CHANNEL_TOKEN,
  },
  [SlackChannel.botPathToVictory]: {
    channelId: process.env.SLACK_BOT_PATH_TO_VICTORY_CHANNEL_ID,
    channelToken: process.env.SLACK_BOT_PATH_TO_VICTORY_CHANNEL_TOKEN,
  },
  [SlackChannel.botPathToVictoryIssues]: {
    channelId: process.env.SLACK_BOT_PATH_TO_VICTORY_ISSUES_CHANNEL_ID,
    channelToken: process.env.SLACK_BOT_PATH_TO_VICTORY_ISSUES_CHANNEL_TOKEN,
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
}
