import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'
import { AdminCreateCamapaignSchema } from './schemas/adminCreateCampaign.schema'
import {
  PrismaClientKnownRequestError,
  PrismaClientValidationError,
} from '@prisma/client/runtime/library'
import { findSlug } from 'src/shared/util/slug.util'
import { AdminUpdateCampaignSchema } from './schemas/adminUpdateCampaign.schema'
import { Prisma } from '@prisma/client'

@Injectable()
export class AdminCampaignsService {
  constructor(private prismaService: PrismaService) {}

  async create(body: AdminCreateCamapaignSchema) {
    const { firstName, lastName, email, zip, phone, party, otherParty } = body

    // check if user with email exists first
    const exists = await this.prismaService.user.count({
      where: {
        email: {
          equals: email,
          mode: 'insensitive',
        },
      },
    })

    if (exists > 0) {
      return 'Email already in use'
    }

    // create new user
    let user
    try {
      user = await this.prismaService.user.create({
        data: {
          firstName,
          lastName,
          email,
          zip,
          phone,
          metaData: {},
          role: 'campaign',
        },
      })
    } catch (error) {
      console.log(error)

      if (error instanceof PrismaClientValidationError) {
        return 'User creation failed - ' + error.name
      }

      throw error
    }

    // find slug
    const slug = await findSlug(this.prismaService, `${firstName} ${lastName}`)
    const data = {
      slug,
      currentStep: 'onboarding-complete',
      party,
      otherParty,
      createdBy: 'admin',
    }

    // create new campaign
    const newCampaign = await this.prismaService.campaign.create({
      data: {
        slug,
        data,
        isActive: true,
        userId: user.id,
        details: {
          zip: user.zip,
          knowRun: 'yes',
          pledged: true,
        },
      },
    })

    // TODO: reimplement these
    // await claimExistingCampaignRequests(user, newCampaign)
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

    try {
      const updatedCampaign = await this.prismaService.campaign.update({
        where: { id },
        data: attributes,
      })

      //TODO: reimplment
      // await sails.helpers.crm.updateCampaign(updatedCampaign);

      return updatedCampaign
    } catch (error) {
      console.log(error)

      if (error instanceof PrismaClientValidationError) {
        return 'Failed to update campaign - ' + error.name
      }

      throw error
    }
  }

  async delete(id: number) {
    try {
      return await this.prismaService.campaign.delete({ where: { id } })
    } catch (error) {
      console.log(error)

      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === 'P2025') return 'Campaign not found'

        return 'Failed to update campaign - ' + (error as any).name
      }

      throw error
    }
  }
}

// async function claimExistingCampaignRequests(user, campaign) {
//   const campaignRequests = await CampaignRequest.find({
//     candidateEmail: user.email,
//   }).populate('user')

//   if (campaignRequests?.length) {
//     for (const campaignRequest of campaignRequests) {
//       const { user } = campaignRequest

//       await CampaignRequest.updateOne({
//         id: campaignRequest.id,
//       }).set({
//         campaign: campaign.id,
//       })

//       await Notification.create({
//         isRead: false,
//         data: {
//           type: 'campaignRequest',
//           title: `${await sails.helpers.user.name(
//             user,
//           )} has requested to manage your campaign`,
//           subTitle: 'You have a request!',
//           link: '/dashboard/team',
//         },
//         user: user.id,
//       })
//     }
//   }
// }
