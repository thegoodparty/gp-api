import { Injectable, Logger, BadGatewayException } from '@nestjs/common';
import { Client } from '@hubspot/api-client';

@Injectable()
export class DeclareService {
  private readonly logger = new Logger(DeclareService.name);
  private readonly hubspotClient: Client;

  constructor () {
    const hubspotToken = process.env.HUBSPOT_TOKEN;
    if (!hubspotToken) {
      this.logger.error('HUBSPOT_TOKEN is not defined in env variables');
      throw new Error('HUBSPOT_TOKEN is required');
    }
    this.hubspotClient = new Client({accessToken: hubspotToken });
  }
  async getDeclarations(): Promise<{ signatures: string }> {
    const formId = 'f51c1352-c778-40a8-b589-b911c31e64b1';

    let response;
    try {
      response = await this.hubspotClient.marketing.forms.formsApi.getById(formId);
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch data from HubSpot API: ${error.message}`,
        error?.response?.data || error.stack,
      );
      throw new BadGatewayException('Failed to fetch data from Hubspot API');
    }

    const data = response.results;

    const uniqueSignatures = new Set<string>();

    if (data?.length) {
      for (const submission of data) {
        if (submission.values.length > 0) {
          let firstName = submission.values[0].value;
          let lastName = submission.values[1].value;
          // format the names to look nice and prevent duplicates.
          if (firstName && firstName.length >= 2) {
            firstName =
              firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase().trim();
          }
          if (lastName && lastName.length >= 2) {
            lastName =
              lastName.charAt(0).toUpperCase() + lastName.slice(1).toLowerCase().trim();
          }

          uniqueSignatures.add(`${firstName} ${lastName}`)
        }
      }
    }

    const signatures = Array.from(uniqueSignatures).join(', ');

    return { signatures };
  }
}