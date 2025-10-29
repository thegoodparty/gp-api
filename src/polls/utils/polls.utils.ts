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

export const BACKFILL_POLLS = [
  {
    userEmail: 'kristianreyes@yahoo.com',
    imageUrl:
      'https://assets.goodparty.org/poll-text-images/16718-kristian-reyes/Screenshot_2025-10-27_135723.png',
  },
  {
    userEmail: 'aliciarpinson@gmail.com',
    imageUrl:
      'https://assets.goodparty.org/poll-text-images/14712-alicia-pinson/1000028281.jpg',
  },
  {
    userEmail: 'mmills5907@gmail.com',
  },
  {
    userEmail: 'chadcody78@gmail.com',
  },
  {
    userEmail: 'anjcons2424@gmail.com',
  },
  {
    userEmail: 'shepley4schoolcommittee@gmail.com',
    imageUrl:
      'https://assets.goodparty.org/poll-text-images/19147-christopher-shepley/campaignlogoFINAL.jpeg',
  },
  {
    userEmail: 'jcstuelke@msn.com',
  },
  {
    userEmail: 'gensleyt@gmail.com',
  },
  {
    userEmail: 'juleshoff19@gmail.com',
  },
  {
    userEmail: 'koreystites@gmail.com',
  },
  {
    userEmail: 'info@votelauzon.com',
    imageUrl:
      'https://assets.goodparty.org/poll-text-images/231246-christopher-lauzon/Screenshot_2025-10-22_at_4.09.45_PM.png',
  },
  {
    userEmail: 'laurenwilliams0423@gmail.com',
    imageUrl:
      'https://assets.goodparty.org/poll-text-images/232011-lauren-williams/Lauren-Williams-3-scaled.jpg',
  },
  {
    userEmail: 'chrisjl@wiaw.net',
  },
  {
    userEmail: 'mark.porter@fairfieldsfuture.org',
    imageUrl:
      'https://assets.goodparty.org/poll-text-images/231882-mark-porter/cc666166-a112-4118-8a5f-f6b433535bbb.png',
  },
  {
    userEmail: 'jaredvs@hotmail.com',
  },
  {
    userEmail: 'taylordepuew@gmail.com',
  },
  {
    userEmail: 'tammy.harris605@gmail.com',
  },
  {
    userEmail: 'fordcountry@roadrunner.com',
  },
  {
    userEmail: 'baldwinj@guilfordschools.org',
    imageUrl:
      'https://assets.goodparty.org/poll-text-images/231269-jennifer-baldwin/Screenshot_2025-10-22_at_10.10.17_AM.png',
  },
  {
    userEmail: 'bob@fergleads.com',
  },
  {
    userEmail: 'jill.story@haverhill-ps.org',
    imageUrl:
      'https://assets.goodparty.org/poll-text-images/231946-jill-story/Screenshot_2025-10-22_at_9.48.15_AM.png',
  },
  {
    userEmail: 'franksefrit@aol.com',
  },
  {
    userEmail: 'info@electrichelle.com',
    imageUrl:
      'https://assets.goodparty.org/poll-text-images/224520-richelle-brown1/Screenshot_2025-10-20_at_3.09.58_PM.png',
  },
  {
    userEmail: 'mudcarver@gmail.com',
  },
  {
    userEmail: 'masstrucking@gmail.com',
  },
  {
    userEmail: 'billybrown60@gmail.com',
  },
  {
    userEmail: 'rosepetal2go@gmail.com',
  },
  {
    userEmail: 'terriskinner@kamiah.org',
  },
  {
    userEmail: 'marquismelton@hotmail.com',
  },
  {
    userEmail: 'matt@grimesasphalt.com',
    imageUrl:
      'https://assets.goodparty.org/poll-text-images/222916-matt-yonker/matt.png',
  },
  {
    userEmail: 'carlof711@gmail.com',
    imageUrl:
      'https://assets.goodparty.org/poll-text-images/222920-carlo-filippone/carlo.jpeg',
  },
  {
    userEmail: 'ward1@cityofwaukon.com',
  },
  {
    userEmail: 'edelrossi24@gmail.com',
  },
  {
    userEmail: 'austin.cole31@yahoo.com',
  },
  {
    userEmail: 'mayorhamilton@villagepointventure.net',
  },
  {
    userEmail: 'natalie4mayor@gmail.com',
    imageUrl:
      'https://assets.goodparty.org/poll-text-images/221492-natalie-johnson/mayor.jpeg',
  },
  {
    userEmail: 'johannafordecorah@gmail.com',
    imageUrl:
      'https://assets.goodparty.org/poll-text-images/221510-johanna-bergan/SMS.jpg',
  },
  {
    userEmail: 'serickson3701@gmail.com',
  },
  {
    userEmail: 'figueroamama666@gmail.com',
  },
  {
    userEmail: 'shawn.seth.williams@gmail.com',
  },
  {
    userEmail: 'cityofmorley@netins.net',
  },
  {
    userEmail: 'cityofrowley@gmail.com',
  },
  {
    userEmail: 'galacticschrute@rocketmail.com',
  },
  {
    userEmail: 'eschwaab@gmail.com',
  },
]
