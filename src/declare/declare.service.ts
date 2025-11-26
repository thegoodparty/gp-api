import { Injectable, Logger, BadGatewayException } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { lastValueFrom } from 'rxjs'
import { Headers } from 'http-constants-ts'

const capitalizeString = (s: string) =>
  s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().trim()

@Injectable()
export class DeclareService {
  private readonly logger = new Logger(DeclareService.name)
  private readonly hubspotApiUrl = 'https://api.hubapi.com'

  constructor(private readonly httpService: HttpService) {}

  async getDeclarations() {
    const formId = 'f51c1352-c778-40a8-b589-b911c31e64b1'
    const hubspotToken = process.env.HUBSPOT_TOKEN
    if (!hubspotToken) {
      throw new Error('Please set HUBSPOT_TOKEN in your .env')
    }

    let response
    try {
      response = await lastValueFrom(
        this.httpService.get(
          `${this.hubspotApiUrl}/form-integrations/v1/submissions/forms/${formId}`,
          {
            headers: {
              [Headers.AUTHORIZATION]: `Bearer ${hubspotToken}`,
            },
          },
        ),
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch data from HubSpot API: ${error.message}`,
        error?.response?.data || error.stack,
      )
      throw new BadGatewayException('Failed to fetch data from Hubspot API')
    }

    const data = (response.data?.results || []) as Array<{
      values: Array<{ value: string }>
    }>

    const uniqueSignatures = new Set<string>()

    if (data?.length) {
      for (const submission of data) {
        if (submission.values.length > 0) {
          let firstName: string = submission.values[0].value
          let lastName: string = submission.values[1].value
          // format the names to look nice and prevent duplicates.
          if (firstName && firstName.length >= 2) {
            firstName = capitalizeString(firstName)
          }
          if (lastName && lastName.length >= 2) {
            lastName = capitalizeString(lastName)
          }

          uniqueSignatures.add(`${firstName} ${lastName}`)
        }
      }
    }

    const signatures = Array.from(uniqueSignatures)

    return signatures
  }
}
