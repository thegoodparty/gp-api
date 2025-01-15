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
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🚨 Voter File Assistance Request 🚨',
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
              {
                type: 'rich_text_section',
                elements: [
                  {
                    type: 'text',
                    text: 'Office: ',
                    style: {
                      bold: true,
                    },
                  },
                  {
                    type: 'text',
                    text: String(office),
                  },
                ],
              },
              {
                type: 'rich_text_section',
                elements: [
                  {
                    type: 'text',
                    text: 'State: ',
                    style: {
                      bold: true,
                    },
                  },
                  {
                    type: 'text',
                    text: String(state),
                  },
                ],
              },
              {
                type: 'rich_text_section',
                elements: [
                  {
                    type: 'text',
                    text: 'Viability Tier: ',
                    style: {
                      bold: true,
                    },
                  },
                  {
                    type: 'text',
                    text: String(tier),
                  },
                ],
              },
              {
                type: 'rich_text_section',
                elements: [
                  {
                    type: 'text',
                    text: 'Type: ',
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
            ],
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
                name: 'speech_balloon',
              },
              {
                type: 'text',
                text: ' Message from Candidate:',
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
          {
            type: 'rich_text_section',
            elements: [
              {
                type: 'text',
                text: '\n\n',
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
                name: 'eyes',
              },
              {
                type: 'text',
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
    ],
  }
}
