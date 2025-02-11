import {
  SlackMessageBlock,
  SlackMessageType,
} from '../../../../shared/services/slackService.types'

export function buildSlackBlocks(
  type,
  email,
  threadId,
  userMessage,
  userPrompt,
  lastThreadMessage,
): { blocks: SlackMessageBlock[] } {
  const title = `${
    type.charAt(0).toUpperCase() + type.slice(1)
  } feedback on AI Chat thread`

  return {
    blocks: [
      {
        type: SlackMessageType.HEADER,
        text: {
          type: SlackMessageType.PLAIN_TEXT,
          text: `💬 ${title}`,
          emoji: true,
        },
      },
      {
        type: SlackMessageType.RICH_TEXT,
        elements: [
          {
            type: SlackMessageType.RICH_TEXT_LIST,
            style: 'bullet',
            elements: [
              {
                type: SlackMessageType.RICH_TEXT_SECTION,
                elements: [
                  {
                    type: SlackMessageType.TEXT,
                    text: 'User: ',
                    style: {
                      bold: true,
                    },
                  },
                  {
                    type: SlackMessageType.TEXT,
                    text: String(email),
                  },
                ],
              },
              userMessage
                ? {
                    type: SlackMessageType.RICH_TEXT_SECTION,
                    elements: [
                      {
                        type: SlackMessageType.TEXT,
                        text: 'Message: ',
                        style: {
                          bold: true,
                        },
                      },
                      {
                        type: SlackMessageType.TEXT,
                        text: String(userMessage),
                      },
                    ],
                  }
                : undefined,
              {
                type: SlackMessageType.RICH_TEXT_SECTION,
                elements: [
                  {
                    type: SlackMessageType.TEXT,
                    text: 'Thread ID: ',
                    style: {
                      bold: true,
                    },
                  },
                  {
                    type: SlackMessageType.TEXT,
                    text: String(threadId),
                  },
                ],
              },
              {
                type: SlackMessageType.RICH_TEXT_SECTION,
                elements: [
                  {
                    type: SlackMessageType.TEXT,
                    text: 'User Prompt: ',
                    style: {
                      bold: true,
                    },
                  },
                  {
                    type: SlackMessageType.TEXT,
                    text: String(userPrompt),
                  },
                ],
              },
            ].filter((elem) => elem !== undefined),
          },
          {
            type: SlackMessageType.RICH_TEXT_SECTION,
            elements: [
              {
                type: SlackMessageType.TEXT,
                text: '\n\n',
              },
            ],
          },
          {
            type: SlackMessageType.RICH_TEXT_SECTION,
            elements: [
              {
                type: SlackMessageType.TEXT,
                text: ' Last Message on Thread:',
                style: {
                  bold: true,
                },
              },
            ],
          },
          {
            type: SlackMessageType.RICH_TEXT_SECTION,
            elements: [
              {
                type: SlackMessageType.TEXT,
                text: lastThreadMessage,
              },
            ],
          },
        ],
      },
    ],
  }
}
