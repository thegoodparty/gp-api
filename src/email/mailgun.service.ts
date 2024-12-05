import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as FormData from 'form-data'
import Mailgun, { MailgunMessageData } from 'mailgun.js'
import { IMailgunClient } from 'mailgun.js/Interfaces'

const EMAIL_DOMAIN = 'mg.goodparty.org'

@Injectable()
export class MailgunService {
  private mailgun: Mailgun
  private client: IMailgunClient

  constructor(private config: ConfigService) {
    this.mailgun = new Mailgun(FormData)
    this.client = this.mailgun.client({
      key: this.config.get('MAILGUN_API_KEY') as string,
      username: 'api',
    })
  }

  sendMessage(emailData: MailgunMessageData) {
    return this.client.messages.create(EMAIL_DOMAIN, emailData)
  }
}
