export const enum SlackChannel {
  botDev = 'bot-dev',
  botPathToVictory = 'bot-path-to-victory',
  botPathToVictoryIssues = 'bot-path-to-victory-issues',
  userFeedback = 'user-feedback',
  botAi = 'bot-ai',
  botPolitics = 'bot-politics',
  botFeedback = 'bot-feedback',
}

export enum SlackMessageType {
  HEADER = 'header',
  RICH_TEXT = 'rich_text',
  RICH_TEXT_SECTION = 'rich_text_section',
  RICH_TEXT_LIST = 'rich_text_list',
  RICH_TEXT_QUOTE = 'rich_text_quote',
  SECTION = 'section',
  PLAIN_TEXT = 'plain_text',
  MRKDWN = 'mrkdwn',
  EMOJI = 'emoji',
  TEXT = 'text',
}

export type SlackMessageBlock = {
  type: SlackMessageType
  text?: string | SlackMessageBlock
  elements?: SlackMessageBlock[]
  style?: string | { bold: boolean }
  emoji?: boolean
}
export type SlackMessage = {
  title?: string
  body?: string
  blocks?: SlackMessageBlock[]
}
