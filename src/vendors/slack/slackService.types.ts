export const enum SlackChannel {
  botDev = 'bot-dev',
  botPathToVictory = 'bot-path-to-victory',
  botPathToVictoryIssues = 'bot-path-to-victory-issues',
  userFeedback = 'user-feedback',
  botAi = 'bot-ai',
  botPolitics = 'bot-politics',
  botFeedback = 'bot-feedback',
  botDeletions = 'bot-deletions',
  bot10DlcCompliance = 'bot-10dlc-compliance',
}

export enum SlackMessageType {
  HEADER = 'header',
  RICH_TEXT = 'rich_text',
  RICH_TEXT_SECTION = 'rich_text_section',
  RICH_TEXT_LIST = 'rich_text_list',
  RICH_TEXT_QUOTE = 'rich_text_quote',
  RICH_TEXT_PREFORMATTED = 'rich_text_preformatted',
  SECTION = 'section',
  PLAIN_TEXT = 'plain_text',
  MRKDWN = 'mrkdwn',
  EMOJI = 'emoji',
  TEXT = 'text',
  DIVIDER = 'divider',
}

export type SlackMessageBlock = {
  type: SlackMessageType
  text?: string | SlackMessageBlock
  elements?: SlackMessageBlock[]
  style?: string | { bold: boolean }
  emoji?: boolean
}

export type SlackMessage = {
  body?: string
  blocks?: SlackMessageBlock[]
}

export type FormattedSlackMessageArgs = {
  message: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error?: any // due to this value being sent directly into JSON.stringify with is an any type
  channel: SlackChannel
}

export type VanitySlackMethodArgs = Pick<
  FormattedSlackMessageArgs,
  'message' | 'error'
>
