// Documentation URL: https://app.rumbleup.com/app/docs/api

import { HttpService } from '@nestjs/axios'
import {
  BadGatewayException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common'
import { lastValueFrom } from 'rxjs'
import {
  ApiRumbleUpProject,
  ApiRumbleUpResponse,
} from '../types/outreach.types'
import { Headers, MimeTypes } from 'http-constants-ts'
import { EmailService } from 'src/email/email.service'
import { ComplianceFormSchema } from '../schemas/complianceForm.schema'
import { Campaign } from '@prisma/client'

// TODO: change this to the email we ultimately want to send to!
const TCR_COMPLIANCE_EMAIL = 'tcr@goodparty.org'

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
    // TODO: this dependency is temporary until we can use rumble up's API
    private readonly email: EmailService,
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
  submitComplianceForm(campaign: Campaign, body: ComplianceFormSchema) {
    //TODO: this should be replaced with an API call to rumble up when its ready to integrate
    return this.email.sendEmail({
      to: TCR_COMPLIANCE_EMAIL,
      subject: 'TCR Compliance Form Submission',
      message: `
        <h2>Compliance Information for ${campaign.slug}</h2>
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
  async submitCompliancePin(pin: string) {
    // TODO how to we send the pin to rumble up?
    return {
      pin,
      success: true,
    }
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
