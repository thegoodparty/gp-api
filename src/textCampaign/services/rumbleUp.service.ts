// Documentation URL: https://app.rumbleup.com/app/docs/api

import { HttpService } from '@nestjs/axios'
import {
  BadGatewayException,
  Injectable,
  Logger,
  HttpStatus,
} from '@nestjs/common'
import { lastValueFrom } from 'rxjs'
import {
  ApiRumbleUpProject,
  ApiRumbleUpResponse,
} from '../types/textCampaign.types'
import { Headers, MimeTypes } from 'http-constants-ts'
import { EmailService } from 'src/email/email.service'
import { ComplianceFormSchema } from '../schemas/complianceForm.schema'
import { Campaign } from '@prisma/client'
import { CrmCampaignsService } from 'src/campaigns/services/crmCampaigns.service'

// TODO: change this to the email we ultimately want to send to!
const TCR_COMPLIANCE_FALLBACK_EMAIL = 'politics@goodparty.org'

@Injectable()
export class RumbleUpService {
  private readonly apiBaseUrl = 'https://app.rumbleup.com/api'
  private readonly logger = new Logger(RumbleUpService.name)
  private readonly accountId: string = process.env.RUMBLE_APP_ACCOUNT_ID!
  private readonly apiKey: string = process.env.RUMBLE_APP_API_KEY!

  private readonly serviceHttpConfig = {
    headers: {
      [Headers.AUTHORIZATION]: `Basic ${Buffer.from(`${this.accountId}:${this.apiKey}`).toString('base64')}`,
      [Headers.CONTENT_TYPE]: MimeTypes.APPLICATION_JSON,
    },
  }

  constructor(
    private readonly httpService: HttpService,
    // TODO: These below dependencies are temporary until we can use rumble up's API!!!
    private readonly email: EmailService,
    private readonly crmCampaigns: CrmCampaignsService,
  ) {
    if (!this.accountId || !this.apiKey) {
      throw new Error('RumbleUp credentials not properly configured')
    }
  }

  async createProject(
    project: ApiRumbleUpProject,
  ): Promise<ApiRumbleUpResponse> {
    try {
      const response = await lastValueFrom(
        this.httpService.post(
          `${this.apiBaseUrl}/action/create`,
          project,
          this.serviceHttpConfig,
        ),
      )
      return response.data
    } catch (error: any) {
      this.handleResponseException(error)
    }
  }

  /** starts the compliance registration process */
  async submitComplianceForm(campaign: Campaign, body: ComplianceFormSchema) {
    //TODO: this email solution should be replaced with an API call to rumble up when its ready to integrate!!!
    const crmCompanyOwner = campaign.data.hubspotId
      ? await this.crmCampaigns.getCrmCompanyOwner(campaign.data.hubspotId)
      : null

    const email = crmCompanyOwner?.email || TCR_COMPLIANCE_FALLBACK_EMAIL

    this.logger.debug(`Sending compliance form email to ${email}`)

    return this.email.sendEmail({
      to: email,
      subject: 'TCR Compliance Form Submission',
      message: `
        <h2>Compliance Information for ${campaign.slug}</h2>
        <a href="${process.env.WEBAPP_ROOT_URL}/admin/campaign-details/${campaign.slug}">View Campaign Details</a>
        <table style="border-collapse: collapse; width: 100%;">
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>EIN:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${body.ein}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Name:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${body.name}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Address:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${body.address}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Website:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><a href="${body.website}">${body.website}</a></td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Email:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><a href="mailto:${body.email}">${body.email}</a></td>
          </tr>
        </table>
      `,
    })
  }

  /** submit the pin code to verify the campaign's compliance email */
  async submitCompliancePin(campaign: Campaign, pin: string) {
    //TODO: this email solution should be replaced with an API call to rumble up when its ready to integrate!!!
    const crmCompanyOwner = campaign.data.hubspotId
      ? await this.crmCampaigns.getCrmCompanyOwner(campaign.data.hubspotId)
      : null

    const email = crmCompanyOwner?.email || TCR_COMPLIANCE_FALLBACK_EMAIL

    this.logger.debug(`Sending compliance pin email to ${email}`)

    return this.email.sendEmail({
      to: email,
      subject: 'TCR Compliance PIN Submission',
      message: `
        <h2>Compliance PIN for ${campaign.slug}</h2>
        <a href="${process.env.WEBAPP_ROOT_URL}/admin/campaign-details/${campaign.slug}">View Campaign Details</a>
        <table style="border-collapse: collapse; width: 100%;">
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>PIN:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${pin}</td>
          </tr>
        </table>
      `,
    })
  }

  private handleResponseException(error: any): never {
    this.logger.error(
      `Failed to make request to RumbleUp API`,
      error.response?.data || error.message,
    )

    if (error.response?.status === HttpStatus.UNAUTHORIZED) {
      throw new BadGatewayException(
        'Unauthorized: Invalid RumbleUp credentials',
      )
    }
    if (error.response?.status === HttpStatus.TOO_MANY_REQUESTS) {
      throw new BadGatewayException('Too many requests to RumbleUp API')
    }

    throw new BadGatewayException(
      `Failed to communicate with RumbleUp API: ${error.response?.data?.message || error.message}`,
    )
  }
}
