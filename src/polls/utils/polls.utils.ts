import { SLACK_CHANNEL_IDS } from '@/vendors/slack/slackService.config'
import { WebClient } from '@slack/web-api'

export const pollMessageGroup = (pollId: string) => `polls-${pollId}`

export const sendTevynAPIPollMessage = async (
  client: WebClient,
  {
    message,
    pollId,
    scheduledDate,
    csv,
    imageUrl,
    userInfo,
    isExpansion,
  }: {
    message: string
    pollId: string
    scheduledDate: string
    csv: {
      fileContent: Buffer
      filename: string
    }
    imageUrl?: string
    userInfo: { name: string; email: string; phone?: string }
    isExpansion: boolean
  },
) => {
  await client.filesUploadV2({
    channel_id: SLACK_CHANNEL_IDS['bot-tevyn-api'].channelId,
    file: csv.fileContent,
    filename: csv.filename,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📋 Tevyn API Form Completion 📋',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Poll ID:* \`${pollId}\``,
        },
      },
      {
        type: 'rich_text',
        elements: [
          {
            type: 'rich_text_section',
            elements: [
              {
                type: 'emoji',
                name: 'gp',
              },
              {
                type: 'text',
                text: ' User Information:',
                style: {
                  bold: true,
                },
              },
            ],
          },
          {
            type: 'rich_text_list',
            style: 'bullet',
            elements: [
              {
                type: 'rich_text_section',
                elements: [
                  {
                    type: 'text',
                    text: 'Name: ',
                    style: {
                      bold: true,
                    },
                  },
                  {
                    type: 'text',
                    text: String(userInfo.name),
                  },
                ],
              },
              {
                type: 'rich_text_section',
                elements: [
                  {
                    type: 'text',
                    text: 'Email: ',
                    style: {
                      bold: true,
                    },
                  },
                  {
                    type: 'text',
                    text: String(userInfo.email),
                  },
                ],
              },
              ...(userInfo.phone
                ? [
                    {
                      type: 'rich_text_section' as const,
                      elements: [
                        {
                          type: 'text' as const,
                          text: 'Phone: ',
                          style: {
                            bold: true,
                          },
                        },
                        {
                          type: 'text' as const,
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
        type: 'divider',
      },
      {
        type: 'rich_text',
        elements: [
          {
            type: 'rich_text_section',
            elements: [
              {
                type: 'emoji',
                name: 'speech_balloon',
              },
              {
                type: 'text',
                text: ' Message:',
                style: {
                  bold: true,
                },
              },
            ],
          },
          {
            type: 'rich_text_quote',
            elements: [
              {
                type: 'text',
                text: message || 'No message provided',
              },
            ],
          },
        ],
      },
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Scheduled Date:* ${scheduledDate}`,
        },
      },
      {
        type: 'divider',
      },
      ...(imageUrl
        ? [
            {
              type: 'section' as const,
              text: {
                type: 'mrkdwn' as const,
                text: String(imageUrl),
              },
            },
          ]
        : []),
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            'Run the following command to upload the results CSV:',
            '',
            `\`aws s3 cp /path/to/local/file.csv s3://${process.env.SERVE_ANALYSIS_BUCKET_NAME}/input/${pollId}.csv\``,
          ].join('\n'),
        },
      },
      {
        type: 'divider',
      },
      ...(isExpansion
        ? [
            {
              type: 'section' as const,
              text: {
                type: 'mrkdwn' as const,
                text: '*NOTE*: This is a poll _expansion_. When uploading the results CSV via S3, be sure to COMBINE previous responses with the new responses, and upload a single CSV.',
              },
            },
          ]
        : []),
    ],
  })
}
