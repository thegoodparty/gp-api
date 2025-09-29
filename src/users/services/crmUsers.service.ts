import {
  BadGatewayException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common'
import { Campaign, User } from '@prisma/client'
import { UsersService } from './users.service'
import { CampaignsService } from '../../campaigns/services/campaigns.service'
import { getMidnightForDate } from '../../shared/util/date.util'
import { HubspotService } from '../../crm/hubspot.service'
import { CRMContactProperties } from '../../crm/crm.types'
import { HttpService } from '@nestjs/axios'
import { lastValueFrom } from 'rxjs'
import { SlackService } from '../../vendors/slack/services/slack.service'
import { Headers, MimeTypes } from 'http-constants-ts'
import { AxiosError, isAxiosError } from 'axios'
import { FilterOperatorEnum } from '@hubspot/api-client/lib/codegen/crm/contacts'

@Injectable()
export class CrmUsersService {
  private readonly logger = new Logger(this.constructor.name)

  constructor(
    private readonly hubspot: HubspotService,
    @Inject(forwardRef(() => UsersService))
    private readonly users: UsersService,
    @Inject(forwardRef(() => CampaignsService))
    private readonly campaigns: CampaignsService,
    private readonly httpService: HttpService,
    private readonly slack: SlackService,
  ) {}

  async calculateCRMContactProperties(
    user: User,
    campaign: Campaign,
  ): Promise<CRMContactProperties> {
    const { firstName, lastName, email, phone, zip, metaData } = user
    const { accountType, whyBrowsing } = metaData || {}

    let browsing_intent: string = ''
    switch (whyBrowsing) {
      case 'considering':
        browsing_intent = 'considering run'
        break
      case 'learning':
        browsing_intent = 'learning about gp'
        break
      case 'test':
        browsing_intent = 'testing tools'
        break
      case 'else':
        browsing_intent = 'other'
        break
    }

    return {
      ...(firstName
        ? {
            firstname: firstName,
          }
        : {}),
      ...(lastName
        ? {
            lastname: lastName,
          }
        : {}),
      email,
      ...(phone
        ? {
            phone,
          }
        : {}),
      type: 'Campaign',
      active_candidate: campaign ? 'Yes' : 'No',
      live_candidate: campaign && campaign?.isActive ? 'true' : 'false',
      source: 'GoodParty.org Site',
      ...(zip
        ? {
            zip,
          }
        : {}),
      ...(accountType && campaign?.id
        ? {
            signup_role: accountType === 'browsing' ? accountType : 'running', // Later, once we have campaign staff/volunteer roles, 'helping'
          }
        : {}),
      ...(campaign?.id
        ? {
            product_user: 'yes',
          }
        : {}),
      ...(browsing_intent ? { browsing_intent } : {}),
    }
  }

  async trackUserLogin(user: User) {
    return await this.trackContact(user, {
      last_login: getMidnightForDate(new Date()).toISOString(),
    })
  }

  private async findCrmContactIdByEmail(email: string) {
    this.logger.debug('Looking up contact by email:', email)
    let crmContactId: string
    try {
      const searchResultObj =
        await this.hubspot.client.crm.contacts.searchApi.doSearch({
          properties: ['email', 'id'],
          filterGroups: [
            {
              filters: [
                {
                  propertyName: 'email',
                  operator: FilterOperatorEnum.Eq,
                  value: email,
                },
              ],
            },
          ],
        })
      this.logger.debug('Search result:', searchResultObj)
      const { total, results } = searchResultObj

      if (!total) {
        throw new Error(`No contacts found for email: ${email}`)
      } else {
        crmContactId = results[0].id
        const {
          properties: { email: crmContactEmail },
        } = results[0]
        if (crmContactEmail !== email) {
          throw new Error('Email mismatch on CRM contact lookup!')
        }
      }

      return crmContactId
    } catch (e) {
      this.logger.debug(
        'could not find contact by email. user has never filled a form!',
        e,
      )
    }
  }

  async trackUserUpdate(userId: number) {
    const user = await this.users.findUser({ id: userId })
    if (!user) {
      this.logger.error(`No user found for given user id: ${userId}`)
      return
    }
    const { metaData } = user
    const { profile_updated_count } = metaData || {}
    const updateCount = (profile_updated_count || 0) + 1

    // update profile_updated_count on user
    await this.users.patchUserMetaData(userId, {
      profile_updated_count: updateCount,
    })

    return await this.trackContact(user, {
      profile_updated_date: getMidnightForDate(new Date()).toISOString(),
      profile_updated_count: `${updateCount}`,
    })
  }

  private async trackContact(
    user: User,
    additionalCrmContactProperties?: Partial<CRMContactProperties>,
  ) {
    const { id: userId, email, metaData } = user
    let { hubspotId: crmContactId } = metaData || {}

    const campaign = await this.campaigns.findByUserId(userId)

    const crmContactProperties = await this.calculateCRMContactProperties(
      user,
      campaign,
    )

    if (!crmContactId) {
      crmContactId = await this.findCrmContactIdByEmail(email)
      this.logger.debug('Found CRM Contact ID by email:', crmContactId)
      crmContactId &&
        (await this.users.patchUserMetaData(userId, {
          hubspotId: crmContactId,
        }))
    }

    const aggregatedCrmContactProperties = {
      ...crmContactProperties,
      ...(additionalCrmContactProperties
        ? { ...additionalCrmContactProperties }
        : {}),
    }

    this.logger.debug(
      'Aggregated CRM Contact Properties:',
      aggregatedCrmContactProperties,
    )

    if (crmContactId) {
      return await this.updateCrmContact(
        crmContactId,
        aggregatedCrmContactProperties,
      )
    } else {
      const newCrmContact = await this.createCrmContact(
        aggregatedCrmContactProperties,
      )
      this.logger.debug('New CRM Contact:', newCrmContact)
      const { id: newCrmContactId } = newCrmContact || {}
      newCrmContactId &&
        (await this.users.patchUserMetaData(userId, {
          hubspotId: newCrmContactId,
        }))
      return newCrmContact
    }
  }

  async submitCrmForm(
    formId: string,
    fields: Record<string, string>[],
    pageName: string,
    pageUri: string,
  ) {
    if (!this.hubspot.client.config.accessToken) {
      this.logger.debug(
        'No API key found for HubSpot client skipping form submission',
      )
      return
    }
    try {
      return await lastValueFrom(
        this.httpService.post(
          `https://api.hsforms.com/submissions/v3/integration/submit/21589597/${formId}`,
          {
            fields,
            context: {
              pageName,
              pageUri,
            },
          },
          {
            method: 'POST',
            headers: {
              [Headers.CONTENT_TYPE]: MimeTypes.APPLICATION_JSON,
              [Headers.ACCEPT]: MimeTypes.APPLICATION_JSON,
            },
          },
        ),
      )
    } catch (error) {
      let message = 'Error submitting form to HubSpot: '
      if (isAxiosError(error)) {
        const axiosError = error as AxiosError
        if (axiosError.response) {
          message += JSON.stringify(axiosError.response.data)
          // Handle error response body here
        } else if (axiosError.request) {
          message += axiosError.request
        } else {
          message += axiosError.message
        }
      } else {
        this.logger.error('Unexpected Error:', error)
      }
      this.logger.error('hubspot error', message, error)
      this.slack.errorMessage({ message: 'Error submitting form', error })
      throw new BadGatewayException(message)
    }
  }

  private async updateCrmContact(
    crmContactId: string,
    crmContactProperties: CRMContactProperties,
  ) {
    try {
      return await this.hubspot.client.crm.contacts.basicApi.update(
        crmContactId,
        {
          properties: crmContactProperties,
        },
      )
    } catch (e) {
      this.logger.error(
        `error updating contact with CRM id: ${crmContactId}`,
        e,
      )
    }
  }

  private async createCrmContact(crmContactProperties: CRMContactProperties) {
    try {
      return await this.hubspot.client.crm.contacts.basicApi.create({
        properties: {
          ...crmContactProperties,
          lifecyclestage: 'opportunity',
        },
      })
    } catch (e) {
      this.logger.error('error creating contact', e)
    }
  }
}
