import { Injectable } from '@nestjs/common'
import { EmailData, MailgunService } from './mailgun.service'
import {
  getSetPasswordEmailContent,
  getBasicEmailContent,
  getRecoverPasswordEmailContent,
} from './util/content.util'
import { User, UserRole } from '@prisma/client'

const APP_BASE = process.env.CORS_ORIGIN as string

type SendEmailInput = {
  to: string
  subject: string
  message: string
  from?: string
}

type SendTemplateEmailInput = {
  to: string
  subject: string
  template: string
  variables?: object
  from?: string
  cc?: string
}

@Injectable()
export class EmailService {
  constructor(private mailgun: MailgunService) {}

  async sendEmail({ to, subject, message, from }: SendEmailInput) {
    return await this.sendEmailWithRetry({
      from: from || 'GoodParty.org <noreply@goodparty.org>',
      to,
      subject,
      text: message,
      html: getBasicEmailContent(message, subject),
    })
  }

  async sendTemplateEmail({
    to,
    subject,
    template,
    variables = {},
    from,
    cc,
  }: SendTemplateEmailInput) {
    const data: EmailData = {
      from: from || 'GoodParty.org <noreply@goodparty.org>',
      to,
      subject,
      template,
      variables: {
        appBase: APP_BASE,
        ...variables,
      },
    }

    if (cc) {
      data.cc = cc
    }

    return await this.sendEmailWithRetry(data)
  }

  async sendRecoverPasswordEmail(user: User) {
    const { firstName, lastName, email, passwordResetToken } = user
    const encodedEmail = email.replace('+', '%2b')
    const link = encodeURI(
      `${APP_BASE}/reset-password?email=${encodedEmail}&token=${passwordResetToken}`,
    )
    const name = `${firstName} ${lastName}`
    const subject = 'Reset your password - The Good Party'
    const message = getRecoverPasswordEmailContent(name, link)

    return await this.sendEmail({ to: user.email, subject, message })
  }

  async sendSetPasswordEmail(user: User) {
    const { firstName, lastName, email, roles, passwordResetToken } = user
    const encodedEmail = email.replace('+', '%2b')
    const link = encodeURI(
      `${APP_BASE}/set-password?email=${encodedEmail}&token=${passwordResetToken}`,
    )
    const variables = {
      content: getSetPasswordEmailContent(
        firstName as string,
        lastName as string,
        link,
        roles,
      ),
    }
    const subject = roles.includes(UserRole.sales)
      ? "You've been added to the GoodParty.org Admin"
      : 'Welcome to GoodParty.org! Set Up Your Account and Access Your Campaign Tools'

    return await this.sendTemplateEmail({
      to: email,
      subject,
      template: 'blank-email',
      variables,
    })
  }

  private async sendEmailWithRetry(emailData: EmailData, retryCount = 5) {
    for (let attempt = 0; attempt < retryCount; attempt++) {
      try {
        return await this.mailgun.sendMessage(emailData)
      } catch (error: any) {
        if (error.status === 429) {
          // Rate limit exceeded
          const retryAfter =
            parseInt(error.response.headers['retry-after'], 10) || 1 // Retry-After header is in seconds
          console.warn(
            `Rate limit exceeded. Retrying after ${retryAfter} seconds...`,
          )
          await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000)) // Convert to milliseconds
        } else {
          throw error // Rethrow if not rate limit error
        }
      }
    }
    throw new Error('Exceeded maximum retry attempts')
  }
}
