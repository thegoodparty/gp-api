import {
  SlackMessageBlock,
  SlackMessageType,
} from 'src/shared/services/slackService.types'

export type AudienceSlackBlock = {
  type: SlackMessageType.RICH_TEXT_SECTION
  elements: [
    {
      type: SlackMessageType.TEXT
      text: string
      style: {
        bold: boolean
      }
    },
    {
      type: SlackMessageType.TEXT
      text: string
    },
  ]
}

type SlackBlocksParams = {
  name?: string
  email?: string
  phone?: string
  assignedPa?: string
  crmCompanyId?: string
  voterFileUrl?: string
  type: string
  budget?: number
  voicemail?: boolean
  date?: string
  script?: string
  messagingScript?: string
  imageUrl?: string
  message?: string
  formattedAudience: Array<AudienceSlackBlock>
  audienceRequest?: string
}

export function buildSlackBlocks({
  name,
  email,
  phone,
  assignedPa,
  crmCompanyId,
  voterFileUrl,
  type,
  budget,
  voicemail,
  date,
  script,
  messagingScript,
  imageUrl,
  message,
  formattedAudience,
  audienceRequest,
}: SlackBlocksParams) {
  const blocks = [
    {
      type: SlackMessageType.HEADER,
      text: {
        type: SlackMessageType.PLAIN_TEXT,
        text: '🚨 Campaign Schedule Request 🚨',
        emoji: true,
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
              text: ' Candidate/User:',
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
                  text: String(name),
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
                  text: String(email),
                },
              ],
            },
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
                  text: String(phone),
                },
              ],
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
              name: 'zap',
            },
            {
              type: SlackMessageType.TEXT,
              text: ' Campaign Details:',
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
                  text: 'Campaign Type: ',
                  style: {
                    bold: true,
                  },
                },
                {
                  type: SlackMessageType.TEXT,
                  text: String(type),
                },
              ],
            },
            {
              type: SlackMessageType.RICH_TEXT_SECTION,
              elements: [
                {
                  type: SlackMessageType.TEXT,
                  text: 'Budget: ',
                  style: {
                    bold: true,
                  },
                },
                {
                  type: SlackMessageType.TEXT,
                  text: '$' + Number(budget).toLocaleString(),
                },
              ],
            },
            // eslint-disable-next-line eqeqeq
            voicemail != undefined
              ? {
                  type: SlackMessageType.RICH_TEXT_SECTION,
                  elements: [
                    {
                      type: SlackMessageType.TEXT,
                      text: 'Voicemail: ',
                      style: {
                        bold: true,
                      },
                    },
                    {
                      type: SlackMessageType.TEXT,
                      text: voicemail ? 'Yes' : 'No',
                    },
                  ],
                }
              : undefined,
            {
              type: SlackMessageType.RICH_TEXT_SECTION,
              elements: [
                {
                  type: SlackMessageType.TEXT,
                  text: 'Scheduled Date: ',
                  style: {
                    bold: true,
                  },
                },
                {
                  type: SlackMessageType.TEXT,
                  text: String(date),
                },
              ],
            },
            {
              type: SlackMessageType.RICH_TEXT_SECTION,
              elements: [
                {
                  type: SlackMessageType.TEXT,
                  text: 'Script Key: ',
                  style: {
                    bold: true,
                  },
                },
                {
                  type: SlackMessageType.TEXT,
                  text: String(script),
                },
              ],
            },
            // eslint-disable-next-line eqeqeq
          ].filter((elem) => elem != undefined),
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
              name: 'eyes',
            },
            {
              type: SlackMessageType.TEXT,
              text: ' Assigned Political Advisor (PA):',
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
        text: `${assignedPa || 'None Assigned'}\n${
          crmCompanyId
            ? `https://app.hubspot.com/contacts/21589597/record/0-2/${crmCompanyId}`
            : 'No CRM company found'
        }`,
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
              name: 'lock',
            },
            {
              type: SlackMessageType.TEXT,
              text: ' Voter File Download Link\n',
              style: {
                bold: true,
              },
            },
            voterFileUrl
              ? {
                  type: 'link',
                  text: 'Voter File Download',
                  url: String(voterFileUrl),
                }
              : {
                  type: SlackMessageType.TEXT,
                  text: 'Error: Not provided or invalid',
                  style: {
                    bold: true,
                  },
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
              name: 'scroll',
            },
            {
              type: SlackMessageType.TEXT,
              text: ' AI-Generated Script:',
              style: {
                bold: true,
              },
            },
          ],
        },
        {
          type: SlackMessageType.RICH_TEXT_PREFORMATTED,
          elements: [
            {
              type: SlackMessageType.TEXT,
              text: String(messagingScript),
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
              name: 'speech_balloon',
            },
            {
              type: SlackMessageType.TEXT,
              text: ' Message From User:\n',
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
              text: message ? String(message) : 'N/A',
            },
          ],
        },
      ],
    },
    {
      type: SlackMessageType.RICH_TEXT,
      elements: [
        {
          type: SlackMessageType.RICH_TEXT_SECTION,
          elements: [
            {
              type: SlackMessageType.EMOJI,
              name: 'busts_in_silhouette',
            },
            {
              type: SlackMessageType.TEXT,
              text: ' Audience Selection:',
              style: {
                bold: true,
              },
            },
          ],
        },
      ],
    },
    {
      type: SlackMessageType.RICH_TEXT,
      elements: [
        {
          type: SlackMessageType.RICH_TEXT_LIST,
          style: 'bullet',
          elements: [
            ...formattedAudience,
            {
              type: SlackMessageType.RICH_TEXT_SECTION,
              elements: [
                {
                  type: SlackMessageType.TEXT,
                  text: 'Audience Request: ',
                  style: {
                    bold: true,
                  },
                },
                {
                  type: SlackMessageType.TEXT,
                  text: audienceRequest ? String(audienceRequest) : 'N/A',
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: SlackMessageType.DIVIDER,
    },
    imageUrl
      ? {
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
                  text: ' Image File:',
                  style: {
                    bold: true,
                  },
                },
              ],
            },
          ],
        }
      : undefined,
    imageUrl
      ? {
          type: SlackMessageType.SECTION,
          text: {
            type: SlackMessageType.MRKDWN,
            text: String(imageUrl),
          },
        }
      : undefined,
  ]

  return {
    // eslint-disable-next-line eqeqeq
    blocks: blocks.filter((block) => block != undefined),
  } as { blocks: SlackMessageBlock[] }
}
