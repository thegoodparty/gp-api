import { User } from '@prisma/client'
import { getUserFullName } from '../../../users/util/users.util'
import { SlackMessageType } from '../../slack/slackService.types'

interface BuildPeerlySlackErrorMessageParams {
  user: User
  formattedError: string
  peerlyIdentityId?: string
}

export const buildPeerlySlackErrorMessage = ({
  user,
  formattedError,
  peerlyIdentityId,
}: BuildPeerlySlackErrorMessageParams) => [
  {
    type: SlackMessageType.HEADER,
    text: {
      type: SlackMessageType.PLAIN_TEXT,
      text: '🚨 TCR/10DLC Compliance Flow Error 🚨',
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
            text: ` User:`,
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
                text: ' Name: ',
                style: {
                  bold: true,
                },
              },
              {
                type: SlackMessageType.TEXT,
                text: String(getUserFullName(user)),
              },
            ],
          },
          {
            type: SlackMessageType.RICH_TEXT_SECTION,
            elements: [
              {
                type: SlackMessageType.TEXT,
                text: ' Email: ',
                style: {
                  bold: true,
                },
              },
              {
                type: SlackMessageType.TEXT,
                text: String(user.email),
              },
            ],
          },
          {
            type: SlackMessageType.RICH_TEXT_SECTION,
            elements: [
              {
                type: SlackMessageType.TEXT,
                text: ' Phone: ',
                style: {
                  bold: true,
                },
              },
              {
                type: SlackMessageType.TEXT,
                text: String(user.phone),
              },
            ],
          },
        ],
      },
      {
        type: SlackMessageType.RICH_TEXT_SECTION,
        elements: [
          {
            type: SlackMessageType.EMOJI,
            name: 'eyeglasses',
          },
          {
            type: SlackMessageType.TEXT,
            text: ` Candidate Peerly Identity ID: ${peerlyIdentityId || 'N/A'}`,
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
            name: 'zap',
          },
          {
            type: SlackMessageType.TEXT,
            text: ' Response Error:',
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
                text: String(formattedError),
              },
            ],
          },
        ].filter((elem) => elem !== undefined),
      },
    ],
  },
]
