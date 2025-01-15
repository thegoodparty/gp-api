import { BadGatewayException, Injectable, Logger } from '@nestjs/common'
import { EmailData, MailgunService } from './mailgun.service'
import {
  getBasicEmailContent,
  getRecoverPasswordEmailContent,
  getSetPasswordEmailContent,
} from './util/content.util'
import { User, UserRole } from '@prisma/client'
import { EmailTemplateNames } from './email.types'
import { getFullName } from '../users/util/users.util'
import { DateFormats, formatDate } from '../shared/util/date.util'
import { APP_BASE } from 'src/shared/util/appEnvironment.util'

type SendEmailInput = {
  to: string
  subject: string
  message: string
  from?: string
}

type SendTemplateEmailInput = {
  to: string
  subject: string
  template: EmailTemplateNames
  variables?: object
  from?: string
  cc?: string
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name)
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
    const { firstName,  email, passwordResetToken } = user
    const encodedEmail = email.replace('+', '%2b')
    const link = encodeURI(
      `${APP_BASE}/set-password?email=${encodedEmail}&token=${passwordResetToken}`,
    )
    const variables = {
      name: firstName,
      link,
      
    }
    const subject = 'Access your free campaign resources!'

    return await this.sendTemplateEmail({
      to: email,
      subject,
      template: EmailTemplateNames.setPassword,
      variables,
    })
  }

  async sendProSubscriptionEndingEmail(user: User) {
    const today = new Date()
    await this.sendTemplateEmail({
      to: user.email,
      subject: `Your Pro Subscription is Ending Today`,
      template: EmailTemplateNames.endOfProSubscription,
      variables: {
        userFullName: getFullName(user),
        todayDateString: formatDate(today, DateFormats.usDate),
      },
    })
  }

  async sendCancellationRequestConfirmationEmail(
    user: User,
    subscriptionEndDate: string,
  ) {
    await this.sendTemplateEmail({
      to: user.email,
      subject: `Your Cancellation Request Has Been Processed – Pro Access Until ${subscriptionEndDate}`,
      template: EmailTemplateNames.subscriptionCancellationConfirmation,
      variables: {
        userFullName: getFullName(user),
        subscriptionEndDate,
      },
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
          this.logger.warn(
            `Rate limit exceeded. Retrying after ${retryAfter} seconds...`,
          )
          await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000)) // Convert to milliseconds
        } else {
          throw new BadGatewayException(
            'error communicating w/ mail service: ',
            error,
          )
        }
      }
    }
    throw new BadGatewayException('Exceeded maximum retry attempts')
  }
}
