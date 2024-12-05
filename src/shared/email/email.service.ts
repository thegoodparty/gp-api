import { Injectable, NotImplementedException } from '@nestjs/common'
import { User, UserRole } from '@prisma/client'
import * as FormData from 'form-data'
import Mailgun from 'mailgun.js'
import { PrismaService } from 'src/prisma/prisma.service'
import { ConfigService } from '@nestjs/config'
import { nanoid } from 'nanoid'

const mailgun = new Mailgun(FormData)
const mg = mailgun.client({
  key: process.env.MAILGUN_API_KEY as string,
  username: 'api',
})

const appBase = process.env.CORS_ORIGIN
const EMAIL_DOMAIN = 'mg.goodparty.org'

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
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async sendEmail({
    to,
    subject,
    message,
    messageHeader,
    from,
  }: SendEmailInput) {
    await this.sendEmailWithRetry({
      from: from || 'GoodParty.org <noreply@goodparty.org>',
      to,
      subject,
      text: message,
      html: html(message, messageHeader, subject),
    })

    return { message: 'email sent successfully' }
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
      'h:X-Mailgun-Variables': JSON.stringify({ appBase, ...variables }),
    }

    if (cc) {
      data.cc = cc
    }

    await this.sendEmailWithRetry(data)

    return {
      message: `email sent successfully => ${JSON.stringify(data || '{}')}`,
    }
  }

  async sendResetPasswordEmail(userId: number) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    })

    console.log(user)

    throw new NotImplementedException(
      'Reset password email not implemented yet',
    )
  }

  async sendSetPasswordEmail(userId: number) {
    const user = await this.generatePasswordResetToken(userId)

    const { firstName, lastName, email, role, passwordResetToken } = user
    const encodedEmail = email.replace('+', '%2b')
    const link = encodeURI(
      `${appBase}/set-password?email=${encodedEmail}&token=${passwordResetToken}`,
    )
    const variables = {
      content: getSetPasswordEmailContent(firstName, lastName, link, role),
    }
    const subject =
      role === 'sales'
        ? "You've been added to the GoodParty.org Admin"
        : 'Welcome to GoodParty.org! Set Up Your Account and Access Your Campaign Tools'

    await this.sendTemplateEmail({
      to: email,
      subject,
      template: 'blank-email',
      variables,
    })

    return true
  }

  private generatePasswordResetToken(userId: number): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordResetToken: nanoid(48),
        passwordResetTokenExpiresAt:
          Date.now() + this.config.get('passwordResetTokenTTL'),
      },
    })
  }

  private async sendEmailWithRetry(emailData, retryCount = 5) {
    for (let attempt = 0; attempt < retryCount; attempt++) {
      try {
        return await mg.messages.create(EMAIL_DOMAIN, emailData)
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

function getSetPasswordEmailContent(
  firstName: string,
  lastName: string,
  link: string,
  role?: UserRole | null,
) {
  if (role === UserRole.sales) {
    return `<table border="0" cellpadding="0" cellspacing="0" height="100%" width="100%">
          <tbody>
            <tr>
              <td>
                <p
                  style="
                    font-size: 16px;
                    font-family: Arial, sans-serif;
                    margin-top: 0;
                    margin-bottom: 5px;
                  "
                >
                Hi ${firstName} ${lastName}!<br/> <br>
                </p>
              </td>
            </tr>
            <tr>
              <td>
                <p
                  style="
                    font-size: 16px;
                    font-family: Arial, sans-serif;
                    margin-top: 0;
                    margin-bottom: 5px;
                  "
                >
                You’ve been added to the GoodParty.org Admin. Please set your password:
                <a href="${link}">Set Your Password</a>
                </p>
              </td>
            </tr>
            <tr>
              <td>
                <br /><br /><a
                  href="${link}"
                  style="
                    padding: 16px 32px;
                    background: black;
                    color: #fff;
                    font-size: 16px;
                    border-radius: 8px;
                    text-decoration: none;
                  "
                >
                  Set Your Password
                </a>
              </td>
            </tr>
          </tbody>
        </table>
        `
  }

  return `<div style="color:#000000">
  Hi ${firstName} ${lastName},
  <br />
  <br />
  It was great learning more about your campaign, and we're excited to help however we can.
  <br />
  <br />
  To get started, please set up your password by clicking the button below. This will give you access to your dashboard, where you'll find all of our free tools including content creation, campaign tracker, and voter data.
  <br />
  <br />

  <table
      width="300"
      style="
        width: 300px;
        background-color: #0D1528;
        border-radius: 8px;
      "
      border="0"
      cellspacing="0"
      cellpadding="0"
      align="center"
    >
      <tr>
        <td
          class="em_white"
          height="42"
          align="center"
          valign="middle"
          style="
            font-family: Arial, sans-serif;
            font-size: 16px;
            color: #ffffff;
            font-weight: bold;
            height: 42px;
          "
        >
          <a
            href="${link}"
            target="_blank"
            style="
              text-decoration: none;
              color: #ffffff;
              line-height: 42px;
              display: block;
            "
          >
            Set Your Password
          </a>
        </td>
      </tr>
    </table>
    <br />
    <br />

    Also, we encourage you to share our endorsement of your campaign on social media using our share kit. Please follow this link to Canva to access the templates and receive instructions for accessing your endorsement image. Or, you can use this link for a quick video tutorial. Let us know if you have any questions about this, and please tag @goodpartyorg should you decide to post. We'll share it with our followers! 
    <br />
    <br /> 
For more information about the offering and our organization, check out these links at your leisure:
<ul>
<li>An interactive demo of how to use GoodParty.org</li>
<li>An overview of the benefits and our free campaigning tools</li>
<li>More information about our mission and vision for empowering grassroots, independent candidates</li>
</ul>
If you have any questions about how to access the tool, our free SMS and yard signs offering, or would like to speak with one of our political associates, please let us know. We're thrilled to endorse your campaign and wish you the best of luck.
    <br />
    <br /> 
All the best,
    <br />
    <br />
GoodParty.org Team
</div>
  `
}

// messageHeader was present in old tg-api version but not used
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function html(msg = '', messageHeader = '', subject = '') {
  return `
<style type="text/css">
  html, body {
  background: #EFEFEF;
  padding: 0;
  margin: 0;
  }
</style>
<table width="100%" height="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF">
  <tr>
    <td width="100%" valign="top" align="center">
      <div
        style="display: none; font-size: 1px; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
        ${subject}
      </div>
      <center>
        <table border="0" cellpadding="0" cellspacing="0" height="100%" width="100%">
          <!-- START INTRO -->
          <tr>
            <td height="40" style="font-size: 40px; line-height: 40px;">&nbsp;</td>
          </tr>
          <tr>
            <td>
              <table cellspacing="0" cellpadding="0" border="0" bgcolor="#FFFF" width="100%" style="max-width: 660px; background: #FFFF center center; background-size: cover;"
                align="center">

                <tr>
                  <td align="center" valign="top"
                    style="font-family: Arial, sans-serif; font-size:14px; line-height:20px; color:#484848; "
                    class="body-text">
                    <p
                      style="font-family: Arial, sans-serif; font-size:18px; line-height:26px; color:#484848; padding:0 20px; margin:0; text-align: left"
                      class="body-text">
                      <br />
                      ${msg}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- END INTRO -->
          <tr>
            <td style="text-align: center">
              <br /><br /><br /><br />
              <p
                style="
                  font-style: italic;
                  font-weight: normal;
                  font-size: 16px;
                  line-height: 22px;
                  text-align: center;
                  color: #555555;
                  text-decoration: none;
                  margin-bottom: 0;
                "
              >
                Free software for free elections by
              </p>
            </td>
          </tr>
          <tr>
            <td style="text-align: center">
            <br />
                <img
                  style="margin: 0 auto"
                  src="https://s3.us-west-2.amazonaws.com/assets.goodparty.org/logo-hologram.png"
                />
            </td>
          </tr>
          <tr>
            <td style="text-align: center">
              <br /><br />
              <p
                style="
                  font-weight: normal;
                  font-size: 11px;
                  line-height: 15px;
                  /* identical to box height, or 136% */

                  text-align: center;
                  letter-spacing: 0.5px;

                  /* Neutral/N40 - Faded Ink */

                  color: #666666;
                "
              >
                To stop receiving updates, you can remove this campaign from  <a href="https://goodparty.org/profile">
                your endorsements
                </a>
              </p>
            </td>
          </tr>
        </table>
      </center>
    </td>
  </tr>
</table>`
}
