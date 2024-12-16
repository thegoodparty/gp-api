import { Injectable } from '@nestjs/common'
import * as FormData from 'form-data'
import Mailgun, { MailgunMessageData } from 'mailgun.js'
import { IMailgunClient } from 'mailgun.js/Interfaces'

const EMAIL_DOMAIN = 'mg.goodparty.org'
const API_KEY = process.env.MAILGUN_API_KEY as string

export type EmailData = MailgunMessageData & {
  variables?: Record<string, string | number | boolean>
}

@Injectable()
export class MailgunService {
  private mailgun: Mailgun
  private client: IMailgunClient

  constructor() {
    this.mailgun = new Mailgun(FormData)
    this.client = this.mailgun.client({
      key: API_KEY,
      username: 'api',
    })
  }

  sendMessage({ variables, ...emailData }: EmailData) {
    if (variables) {
      emailData['h:X-Mailgun-Variables'] = JSON.stringify(variables)
    }

    if (process.env.MAILGUN_INTERCEPT_EMAIL) {
      // override to email address to send to MAILGUN_INTERCEPT_EMAIL
      emailData.to = process.env.MAILGUN_INTERCEPT_EMAIL
    }

    return this.client.messages.create(EMAIL_DOMAIN, emailData)
  }
}
