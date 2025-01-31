import { Injectable, Logger } from '@nestjs/common'
import { Campaign, User } from '@prisma/client'
import { UsersService } from '../users/users.service'
import { CampaignsService } from '../campaigns/services/campaigns.service'
import { getMidnightForDate } from '../shared/util/date.util'
import { HubspotService } from './hubspot.service'
import { CRMContactProperties } from './crm.types'

@Injectable()
export class CrmUsersService {
  private readonly logger = new Logger(this.constructor.name)

  constructor(
    private readonly hubspot: HubspotService,
    private readonly users: UsersService,
    private readonly campaigns: CampaignsService,
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

  async trackUserLogin(userId: number) {
    return await this.trackContact(userId, {
      last_login: getMidnightForDate(new Date()).toISOString(),
    })
  }

  private async findCrmContactIdByEmail(email: string) {
    try {
      const { id: crmContactId } =
        await this.hubspot.client.crm.contacts.basicApi.getById(
          email,
          ['id', 'email'],
          undefined,
          undefined,
          undefined,
          'email',
        )

      return crmContactId
    } catch (e) {
      this.logger.error(
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

    return await this.trackContact(userId, {
      profile_updated_date: getMidnightForDate(new Date()).toISOString(),
      profile_updated_count: `${updateCount}`,
    })
  }

  private async trackContact(
    userId: number,
    additionalCrmContactProperties?: Partial<CRMContactProperties>,
  ) {
    const user = await this.users.findUser({ id: userId })
    if (!user) {
      this.logger.error(`No user found for given user id: ${userId}`)
      return
    }
    const { email, metaData } = user
    let { hubspotId: crmContactId } = metaData || {}

    const campaign = await this.campaigns.findByUserId(userId)

    const contactObj = await this.calculateCRMContactProperties(user, campaign)

    if (!crmContactId) {
      crmContactId = await this.findCrmContactIdByEmail(email)
      crmContactId &&
        (await this.users.patchUserMetaData(userId, {
          hubspotId: crmContactId,
        }))
    }

    const aggregatedCrmContactProperties = {
      ...contactObj,
      ...(additionalCrmContactProperties
        ? { ...additionalCrmContactProperties }
        : {}),
    }

    if (crmContactId) {
      return await this.updateCrmContact(
        crmContactId,
        aggregatedCrmContactProperties,
      )
    } else {
      const newCrmContact = await this.createCrmContact(
        aggregatedCrmContactProperties,
      )
      const { id: newCrmContactId } = newCrmContact || {}
      newCrmContactId &&
        (await this.users.patchUserMetaData(userId, {
          hubspotId: newCrmContactId,
        }))
      return newCrmContact
    }
  }

  private async updateCrmContact(
    crmContactId: string,
    crmContactProperties: CRMContactProperties,
  ) {
    try {
      return this.hubspot.client.crm.contacts.basicApi.update(crmContactId, {
        properties: crmContactProperties,
      })
    } catch (e) {
      this.logger.error(
        `error updating contact with CRM id: ${crmContactId}`,
        e,
      )
    }
  }

  private async createCrmContact(crmContactProperties: CRMContactProperties) {
    try {
      return this.hubspot.client.crm.contacts.basicApi.create({
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
