import {
  SlackMessageBlock,
  SlackMessageType,
} from 'src/vendors/slack/slackService.types'

export const buildTevynApiSlackBlocks = ({
  message,
  pollId,
  csvFileUrl,
  imageUrl,
  userInfo,
  isExpansion,
}: {
  message: string
  pollId: string
  csvFileUrl: string
  imageUrl?: string
  userInfo: { name: string; email: string; phone?: string }
  isExpansion: boolean
}): SlackMessageBlock[] => [
  {
    type: SlackMessageType.HEADER,
    text: {
      type: SlackMessageType.PLAIN_TEXT,
      text: '📋 Tevyn API Form Completion 📋',
      emoji: true,
    },
  },
  {
    type: SlackMessageType.SECTION,
    text: {
      type: SlackMessageType.MRKDWN,
      text: `*Poll ID:* \`${pollId}\``,
    },
  },
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
          ...(userInfo.phone
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
  {
    type: SlackMessageType.SECTION,
    text: {
      type: SlackMessageType.MRKDWN,
      text: `📊 *CSV File (500 constituents):*\n<${csvFileUrl}|Download CSV>`,
    },
  },
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
    type: SlackMessageType.SECTION,
    text: {
      type: SlackMessageType.MRKDWN,
      text: [
        'Run the following command to upload the results CSV:',
        '',
        `\`aws s3 cp /path/to/local/file.csv s3://${process.env.SERVE_ANALYSIS_BUCKET_NAME}/input/${pollId}.csv\``,
      ].join('\n'),
    },
  },
  {
    type: SlackMessageType.DIVIDER,
  },
  ...(isExpansion
    ? [
        {
          type: SlackMessageType.SECTION,
          text: {
            type: SlackMessageType.MRKDWN,
            text: '*NOTE*: This is a poll _expansion_. When uploading the results CSV via S3, be sure to COMBINE previous responses with the new responses, and upload a single CSV.',
          },
        },
      ]
    : []),
]
