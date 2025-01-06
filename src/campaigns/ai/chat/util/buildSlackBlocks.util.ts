export function buildSlackBlocks(
  type,
  email,
  threadId,
  userMessage,
  userPrompt,
  lastThreadMessage,
) {
  const title = `${
    type.charAt(0).toUpperCase() + type.slice(1)
  } feedback on AI Chat thread`

  return {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `💬 ${title}`,
          emoji: true,
        },
      },
      {
        type: 'rich_text',
        elements: [
          {
            type: 'rich_text_list',
            style: 'bullet',
            elements: [
              {
                type: 'rich_text_section',
                elements: [
                  {
                    type: 'text',
                    text: 'User: ',
                    style: {
                      bold: true,
                    },
                  },
                  {
                    type: 'text',
                    text: String(email),
                  },
                ],
              },
              userMessage
                ? {
                    type: 'rich_text_section',
                    elements: [
                      {
                        type: 'text',
                        text: 'Message: ',
                        style: {
                          bold: true,
                        },
                      },
                      {
                        type: 'text',
                        text: String(userMessage),
                      },
                    ],
                  }
                : undefined,
              {
                type: 'rich_text_section',
                elements: [
                  {
                    type: 'text',
                    text: 'Thread ID: ',
                    style: {
                      bold: true,
                    },
                  },
                  {
                    type: 'text',
                    text: String(threadId),
                  },
                ],
              },
              {
                type: 'rich_text_section',
                elements: [
                  {
                    type: 'text',
                    text: 'User Prompt: ',
                    style: {
                      bold: true,
                    },
                  },
                  {
                    type: 'text',
                    text: String(userPrompt),
                  },
                ],
              },
            ].filter((elem) => elem !== undefined),
          },
          {
            type: 'rich_text_section',
            elements: [
              {
                type: 'text',
                text: '\n\n',
              },
            ],
          },
          {
            type: 'rich_text_section',
            elements: [
              {
                type: 'text',
                text: ' Last Message on Thread:',
                style: {
                  bold: true,
                },
              },
            ],
          },
          {
            type: 'rich_text_preformatted',
            elements: [
              {
                type: 'text',
                text: lastThreadMessage,
              },
            ],
          },
        ],
      },
    ],
  }
}
