import { Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { nanoid } from 'nanoid'
import { Prisma, User } from '@prisma/client'
import { PrismaService } from 'src/shared/services/prisma.service'
import { MailgunService } from './mailgun.service'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import {
  getSetPasswordEmailContent,
  getBasicEmailContent,
  getRecoverPasswordEmailContent,
} from './util/content.util'

type SendEmailInput = {
  to: string
  subject: string
  message: string
  messageHeader?: string
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
  private appBase: string

  constructor(
    private mailgun: MailgunService,
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.appBase = this.config.get('CORS_ORIGIN') as string
  }

  async sendEmail({
    to,
    subject,
    message,
    messageHeader,
    from,
  }: SendEmailInput) {
    return await this.sendEmailWithRetry({
      from: from || 'GoodParty.org <noreply@goodparty.org>',
      to,
      subject,
      text: message,
      html: getBasicEmailContent(message, messageHeader, subject),
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
    const data: Record<string, string> = {
      from: from || 'GoodParty.org <noreply@goodparty.org>',
      to,
      subject,
      template,
      'h:X-Mailgun-Variables': JSON.stringify({
        appBase: this.appBase,
        ...variables,
      }),
    }

    if (cc) {
      data.cc = cc
    }

    return await this.sendEmailWithRetry(data)
  }

  async sendRecoverPasswordEmail(userEmail: string) {
    const user = await this.generatePasswordResetToken({ email: userEmail })

    const { firstName, lastName, email, passwordResetToken } = user
    const lowerCaseEmail = email.toLowerCase().replace('+', '%2b')
    const link = encodeURI(
      `${this.appBase}/reset-password?email=${lowerCaseEmail}&token=${passwordResetToken}`,
    )
    const name = `${firstName} ${lastName}`
    const subject = 'Reset your password - The Good Party'
    const message = getRecoverPasswordEmailContent(name, link)

    return await this.sendEmail({ to: user.email, subject, message })
  }

  async sendSetPasswordEmail(userId: number) {
    const user = await this.generatePasswordResetToken({ id: userId })

    const { firstName, lastName, email, role, passwordResetToken } = user
    const encodedEmail = email.replace('+', '%2b')
    const link = encodeURI(
      `${this.appBase}/set-password?email=${encodedEmail}&token=${passwordResetToken}`,
    )
    const variables = {
      content: getSetPasswordEmailContent(
        firstName as string,
        lastName as string,
        link,
        role,
      ),
    }
    const subject =
      role === 'sales'
        ? "You've been added to the GoodParty.org Admin"
        : 'Welcome to GoodParty.org! Set Up Your Account and Access Your Campaign Tools'

    return await this.sendTemplateEmail({
      to: email,
      subject,
      template: 'blank-email',
      variables,
    })
  }

  private async generatePasswordResetToken(
    where: Prisma.UserWhereUniqueInput,
  ): Promise<User> {
    try {
      return await this.prisma.user.update({
        where,
        data: {
          passwordResetToken: nanoid(48),
          passwordResetTokenExpiresAt:
            Date.now() + this.config.get('passwordResetTokenTTL'),
        },
      })
    } catch (e) {
      if (e instanceof PrismaClientKnownRequestError) {
        console.log('Could not find user to reset password')
        throw new NotFoundException('User not found')
      }

      throw e
    }
  }

  private async sendEmailWithRetry(emailData, retryCount = 5) {
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
