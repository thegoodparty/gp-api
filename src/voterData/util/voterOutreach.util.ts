import { SlackMessageBlock } from 'src/shared/services/slackService.types'

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
}) {
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🚨 Campaign Schedule Request 🚨',
        emoji: true,
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
              text: ' Candidate/User:',
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
                  text: String(name),
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
                  text: String(email),
                },
              ],
            },
            {
              type: 'rich_text_section',
              elements: [
                {
                  type: 'text',
                  text: 'Phone: ',
                  style: {
                    bold: true,
                  },
                },
                {
                  type: 'text',
                  text: String(phone),
                },
              ],
            },
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
              name: 'zap',
            },
            {
              type: 'text',
              text: ' Campaign Details:',
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
                  text: 'Campaign Type: ',
                  style: {
                    bold: true,
                  },
                },
                {
                  type: 'text',
                  text: String(type),
                },
              ],
            },
            {
              type: 'rich_text_section',
              elements: [
                {
                  type: 'text',
                  text: 'Budget: ',
                  style: {
                    bold: true,
                  },
                },
                {
                  type: 'text',
                  text: '$' + Number(budget).toLocaleString(),
                },
              ],
            },
            // eslint-disable-next-line eqeqeq
            voicemail != undefined
              ? {
                  type: 'rich_text_section',
                  elements: [
                    {
                      type: 'text',
                      text: 'Voicemail: ',
                      style: {
                        bold: true,
                      },
                    },
                    {
                      type: 'text',
                      text: voicemail ? 'Yes' : 'No',
                    },
                  ],
                }
              : undefined,
            {
              type: 'rich_text_section',
              elements: [
                {
                  type: 'text',
                  text: 'Scheduled Date: ',
                  style: {
                    bold: true,
                  },
                },
                {
                  type: 'text',
                  text: String(date),
                },
              ],
            },
            {
              type: 'rich_text_section',
              elements: [
                {
                  type: 'text',
                  text: 'Script Key: ',
                  style: {
                    bold: true,
                  },
                },
                {
                  type: 'text',
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
              name: 'eyes',
            },
            {
              type: 'text',
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
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${assignedPa || 'None Assigned'}\n${
          crmCompanyId
            ? `https://app.hubspot.com/contacts/21589597/record/0-2/${crmCompanyId}`
            : 'No CRM company found'
        }`,
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
              name: 'lock',
            },
            {
              type: 'text',
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
                  type: 'text',
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
              name: 'scroll',
            },
            {
              type: 'text',
              text: ' AI-Generated Script:',
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
              text: String(messagingScript),
            },
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
              text: ' Message From User:\n',
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
              text: String(message),
            },
          ],
        },
      ],
    },
    {
      type: 'rich_text',
      elements: [
        {
          type: 'rich_text_section',
          elements: [
            {
              type: 'emoji',
              name: 'busts_in_silhouette',
            },
            {
              type: 'text',
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
      type: 'rich_text',
      elements: [
        {
          type: 'rich_text_list',
          style: 'bullet',
          elements: [
            ...formattedAudience,
            {
              type: 'rich_text_section',
              elements: [
                {
                  type: 'text',
                  text: 'Audience Request: ',
                  style: {
                    bold: true,
                  },
                },
                {
                  type: 'text',
                  text: audienceRequest ? String(audienceRequest) : 'N/A',
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: 'divider',
    },
    imageUrl
      ? {
          type: 'rich_text',
          elements: [
            {
              type: 'rich_text_section',
              elements: [
                {
                  type: 'emoji',
                  name: 'floppy_disk',
                },
                {
                  type: 'text',
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
          type: 'section',
          text: {
            type: 'mrkdwn',
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
