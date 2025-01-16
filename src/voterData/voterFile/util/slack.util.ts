import { SlackMessageType } from 'src/shared/services/slackService.types'

type Inputs = {
  name: string
  email: string
  type: string
  message: string
  phone?: string | null
  office?: string
  state?: string
  tier?: string | null
  assignedPa?: string
  crmCompanyId?: string
}

export function buildSlackBlocks({
  name,
  email,
  type,
  message,
  phone,
  office,
  state,
  tier,
  assignedPa,
  crmCompanyId,
}: Inputs) {
  return {
    blocks: [
      {
        type: SlackMessageType.HEADER,
        text: {
          type: SlackMessageType.PLAIN_TEXT,
          text: '🚨 Voter File Assistance Request 🚨',
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
              {
                type: SlackMessageType.RICH_TEXT_SECTION,
                elements: [
                  {
                    type: SlackMessageType.TEXT,
                    text: 'Office: ',
                    style: {
                      bold: true,
                    },
                  },
                  {
                    type: SlackMessageType.TEXT,
                    text: String(office),
                  },
                ],
              },
              {
                type: SlackMessageType.RICH_TEXT_SECTION,
                elements: [
                  {
                    type: SlackMessageType.TEXT,
                    text: 'State: ',
                    style: {
                      bold: true,
                    },
                  },
                  {
                    type: SlackMessageType.TEXT,
                    text: String(state),
                  },
                ],
              },
              {
                type: SlackMessageType.RICH_TEXT_SECTION,
                elements: [
                  {
                    type: SlackMessageType.TEXT,
                    text: 'Viability Tier: ',
                    style: {
                      bold: true,
                    },
                  },
                  {
                    type: SlackMessageType.TEXT,
                    text: String(tier),
                  },
                ],
              },
              {
                type: SlackMessageType.RICH_TEXT_SECTION,
                elements: [
                  {
                    type: SlackMessageType.TEXT,
                    text: 'Type: ',
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
            ],
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
                name: 'speech_balloon',
              },
              {
                type: SlackMessageType.TEXT,
                text: ' Message from Candidate:',
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
                text: String(message),
              },
            ],
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
                name: 'eyes',
              },
              {
                type: SlackMessageType.TEXT,
                text: ' Assigned PA:',
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
    ],
  }
}
