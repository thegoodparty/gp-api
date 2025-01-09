import { BadRequestException, Injectable } from '@nestjs/common'
import { AdminCreateCampaignSchema } from './schemas/adminCreateCampaign.schema'
import { AdminUpdateCampaignSchema } from './schemas/adminUpdateCampaign.schema'
import { Prisma } from '@prisma/client'
import { EmailService } from 'src/email/email.service'
import { getFullName } from 'src/users/util/users.util'
import { EmailTemplates } from 'src/email/email.types'
import { UsersService } from 'src/users/users.service'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { AdminP2VService } from '../services/adminP2V.service'
import { CampaignData } from 'src/campaigns/campaigns.types'

const APP_BASE = process.env.CORS_ORIGIN as string

@Injectable()
export class AdminCampaignsService {
  constructor(
    private emailService: EmailService,
    private usersService: UsersService,
    private campaignsService: CampaignsService,
    private adminP2VService: AdminP2VService,
  ) {}

  async create(body: AdminCreateCampaignSchema) {
    const { firstName, lastName, email, zip, phone, party, otherParty } = body

    // create new user
    const user = await this.usersService.createUser({
      firstName,
      lastName,
      email,
      zip,
      phone,
    })

    // find slug
    const slug = await this.campaignsService.findSlug(user)
    const data = {
      slug,
      currentStep: 'onboarding-complete',
      party,
      otherParty,
      createdBy: 'admin',
    }

    // create new campaign
    const newCampaign = await this.campaignsService.create({
      slug,
      data,
      isActive: true,
      userId: user.id,
      details: {
        zip: user.zip,
        knowRun: 'yes',
        pledged: true,
      },
    })

    // TODO: reimplement
    // await createCrmUser(firstName, lastName, email)

    return newCampaign
  }

  async update(id: number, body: AdminUpdateCampaignSchema) {
    const { isVerified, isPro, didWin, tier } = body
    const attributes: Prisma.CampaignUpdateInput = {}

    if (typeof isVerified !== 'undefined') {
      attributes.isVerified = isVerified
      attributes.dateVerified = isVerified === null ? null : new Date()
    }
    if (typeof isPro !== 'undefined') {
      attributes.isPro = isPro
    }
    if (typeof didWin !== 'undefined') {
      attributes.didWin = didWin
    }
    if (typeof tier !== 'undefined') {
      attributes.tier = tier
    }

    const updatedCampaign = await this.campaignsService.update(id, attributes)

    //TODO: reimplment
    // await sails.helpers.crm.updateCampaign(updatedCampaign);

    return updatedCampaign
  }

  async sendVictoryEmail(id: number) {
    const campaign = await this.campaignsService.findOneOrThrow(
      { id },
      { user: true, pathToVictory: true },
    )
    const { pathToVictory, user } = campaign

    if (!pathToVictory) {
      throw new BadRequestException('Path to Victory is not set.')
    }
    if (!user) {
      throw new BadRequestException('Campaign has no user')
    }

    await this.adminP2VService.completeP2V(user.id, pathToVictory)

    if ((campaign?.data as CampaignData)?.createdBy !== 'admin') {
      const variables = {
        name: getFullName(user),
        link: `${APP_BASE}/dashboard`,
      }

      await this.emailService.sendTemplateEmail({
        to: user.email,
        subject: 'Exciting News: Your Customized Campaign Plan is Updated!',
        template: EmailTemplates.candidateVictoryReady,
        variables,
        from: 'jared@goodparty.org',
      })
    }

    return true
  }
}
