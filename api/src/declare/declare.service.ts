import { Injectable, HttpException, HttpStatus } from '@nestjs/common';

interface Submission {
  values: { value: string}[];
}

interface HubspotResponse {
  results: Submission[];
}

function isHubspotResponse(data: any): data is HubspotResponse {
  return (
    data &&
    Array.isArray(data.results) &&
    data.results.every(
      (submission: any) =>
        Array.isArray(submission.values) &&
        submission.values.every(
          (value: any) => typeof value.value === 'string',
        ),
    )
  );
}

@Injectable()
export class DeclareService {
  private readonly hubspotToken = process.env.HUBSPOT_TOKEN;

  async getDeclarations(): Promise<{ signatures: string }> {
    const formId = 'f51c1352-c778-40a8-b589-b911c31e64b1';
    const url = `https://api.hubapi.com/form-integrations/v1/submissions/forms/${formId}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.hubspotToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
      }

      const responseData = await response.json();

      if (!isHubspotResponse(responseData)) {
        throw new Error('Invalid response structure from Hubspot API');
      }

      const data = responseData.results;

      const signaturesObj: Record<string, boolean> = {};
      let signatures = '';

      if (data && data.length > 0) {
        for (const submission of data) {
          if (submission.values.length > 0) {
            let fn = submission.values[0].value;
            let ln = submission.values[1].value;
            // format the names to look nice and prevent duplicates.
            if (fn && fn.length >= 2) {
              fn =
                fn.charAt(0).toUpperCase() + fn.slice(1).toLowerCase().trim();
            }
            if (ln && ln.length >= 2) {
              ln =
                ln.charAt(0).toUpperCase() + ln.slice(1).toLowerCase().trim();
            }

            const name = `${fn} ${ln}`;
            if (!signaturesObj[name]) {
              signatures += `${name}, `;
              signaturesObj[name] = true;
            }
          }
        }
      }
      
      if (signatures.length > 2) {
        signatures = signatures.slice(0, -2);
      }

      return { signatures };
    } catch (error) {
      console.error('Error fetching declarations:', error);
      throw new HttpException(
        { message: 'Error fetching declarations', error: error.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}