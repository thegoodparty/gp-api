import { Injectable, Logger } from '@nestjs/common'
import FormData from 'form-data'
import Mailgun, { MailgunMessageData } from 'mailgun.js'
import { IMailgunClient } from 'mailgun.js/Interfaces'

const EMAIL_DOMAIN = 'mg.goodparty.org'
const API_KEY = process.env.MAILGUN_API_KEY as string
if (!API_KEY) {
  throw new Error('Please set MAILGUN_API_KEY in your .env')
}

export type EmailData = MailgunMessageData & {
  variables?: Record<string, string | number | boolean>
  template?: string
}

@Injectable()
export class MailgunService {
  private logger = new Logger(MailgunService.name)
  private mailgun: Mailgun
  private client: IMailgunClient

  constructor() {
    this.mailgun = new Mailgun(FormData)
    this.client = this.mailgun.client({
      key: API_KEY,
      username: 'api',
    })
  }

  async sendMessage({ variables, ...emailData }: EmailData) {
    if (variables) {
      try {
        emailData['h:X-Mailgun-Variables'] = JSON.stringify(variables)
      } catch (_error) {
        this.logger.error(
          `Failed to stringify variables for email ${emailData.to}:`,
          { variables },
        )
        throw new Error(
          `Failed to stringify variables for email: ${emailData.to}`,
          variables,
        )
      }
    }

    // Add tag header based on template name
    if (emailData.template && process.env.TRACK_MAILGUN_EMAILS === 'true') {
      emailData['o:tag'] = emailData.template
    }

    if (process.env.MAILGUN_INTERCEPT_EMAIL) {
      // override to email address to send to MAILGUN_INTERCEPT_EMAIL
      this.logger.debug(
        `Intercepting email for ${emailData.to} - sending to ${process.env.MAILGUN_INTERCEPT_EMAIL}`,
      )
      emailData.to = process.env.MAILGUN_INTERCEPT_EMAIL
    }

    return await this.client.messages.create(EMAIL_DOMAIN, emailData)
  }
}
