import { SlackMessageType } from 'src/vendors/slack/slackService.types'

export function buildTevynApiSlackBlocks({
  message,
  pollId,
  csvFileUrl,
  imageUrl,
  userInfo,
  campaignSlug,
}: {
  message: string
  pollId?: string
  csvFileUrl?: string
  imageUrl?: string
  userInfo?: { name?: string; email?: string; phone?: string }
  campaignSlug?: string
}) {
  const blocks = [
    {
      type: SlackMessageType.HEADER,
      text: {
        type: SlackMessageType.PLAIN_TEXT,
        text: '📋 Tevyn API Form Completion 📋',
        emoji: true,
      },
    },
    ...(campaignSlug
      ? ([
          {
            type: SlackMessageType.SECTION,
            text: {
              type: SlackMessageType.MRKDWN,
              text: `*Campaign:* ${campaignSlug}`,
            },
          },
        ] as const)
      : []),
    ...(pollId
      ? ([
          {
            type: SlackMessageType.SECTION,
            text: {
              type: SlackMessageType.MRKDWN,
              text: `*Poll ID:* \`${pollId}\``,
            },
          },
        ] as const)
      : []),
    {
      type: SlackMessageType.RICH_TEXT,
      elements: [
        {
          type: SlackMessageType.RICH_TEXT_SECTION,
          elements: [
            {
              type: SlackMessageType.EMOJI,
              name: 'gp',
            },
            {
              type: SlackMessageType.TEXT,
              text: ' User Information:',
              style: {
                bold: true,
              },
            },
          ],
        },
        {
          type: SlackMessageType.RICH_TEXT_LIST,
          style: 'bullet',
          elements: [
            ...(userInfo?.name
              ? [
                  {
                    type: SlackMessageType.RICH_TEXT_SECTION,
                    elements: [
                      {
                        type: SlackMessageType.TEXT,
                        text: 'Name: ',
                        style: {
                          bold: true,
                        },
                      },
                      {
                        type: SlackMessageType.TEXT,
                        text: String(userInfo.name),
                      },
                    ],
                  },
                ]
              : []),
            ...(userInfo?.email
              ? [
                  {
                    type: SlackMessageType.RICH_TEXT_SECTION,
                    elements: [
                      {
                        type: SlackMessageType.TEXT,
                        text: 'Email: ',
                        style: {
                          bold: true,
                        },
                      },
                      {
                        type: SlackMessageType.TEXT,
                        text: String(userInfo.email),
                      },
                    ],
                  },
                ]
              : []),
            ...(userInfo?.phone
              ? [
                  {
                    type: SlackMessageType.RICH_TEXT_SECTION,
                    elements: [
                      {
                        type: SlackMessageType.TEXT,
                        text: 'Phone: ',
                        style: {
                          bold: true,
                        },
                      },
                      {
                        type: SlackMessageType.TEXT,
                        text: String(userInfo.phone),
                      },
                    ],
                  },
                ]
              : []),
          ],
        },
      ],
    },
    {
      type: SlackMessageType.DIVIDER,
    },
    {
      type: SlackMessageType.RICH_TEXT,
      elements: [
        {
          type: SlackMessageType.RICH_TEXT_SECTION,
          elements: [
            {
              type: SlackMessageType.EMOJI,
              name: 'speech_balloon',
            },
            {
              type: SlackMessageType.TEXT,
              text: ' Message:',
              style: {
                bold: true,
              },
            },
          ],
        },
        {
          type: SlackMessageType.RICH_TEXT_QUOTE,
          elements: [
            {
              type: SlackMessageType.TEXT,
              text: message || 'No message provided',
            },
          ],
        },
      ],
    },
    {
      type: SlackMessageType.DIVIDER,
    },
    {
      type: SlackMessageType.RICH_TEXT,
      elements: [
        {
          type: SlackMessageType.RICH_TEXT_SECTION,
          elements: [
            {
              type: SlackMessageType.EMOJI,
              name: 'floppy_disk',
            },
            {
              type: SlackMessageType.TEXT,
              text: ' Files:',
              style: {
                bold: true,
              },
            },
          ],
        },
      ],
    },
    ...(csvFileUrl
      ? [
          {
            type: SlackMessageType.SECTION,
            text: {
              type: SlackMessageType.MRKDWN,
              text: `📊 *CSV File (500 constituents):*\n<${csvFileUrl}|Download CSV>`,
            },
          },
        ]
      : []),
    ...(imageUrl
      ? [
          {
            type: SlackMessageType.SECTION,
            text: {
              type: SlackMessageType.MRKDWN,
              text: String(imageUrl),
            },
          },
        ]
      : []),
    {
      type: SlackMessageType.DIVIDER,
    },
  ]

  return blocks
}
