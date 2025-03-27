import {
  ScheduledMessageTypes,
  SendEmailInput,
  SendTemplateEmailInput,
} from '../../src/email/email.types'

export {}

declare global {
  export namespace PrismaJson {
    export type ScheduledMessageConfig = {
      type: ScheduledMessageTypes
      message: SendTemplateEmailInput | SendEmailInput
    }
  }
}
