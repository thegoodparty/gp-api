import {
  ScheduledMessageTypes,
  SendEmailInput,
  SendTemplateEmailInput,
} from '../../src/email/email.types'

declare global {
  export namespace PrismaJson {
    export interface ScheduledMessageConfig {
      type: ScheduledMessageTypes
      message: SendEmailInput | SendTemplateEmailInput
    }
  }
}
