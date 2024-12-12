import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { UpdateCampaignSchema } from './schemas/updateCampaign.schema'
import { CampaignListSchema } from './schemas/campaignList.schema'
import { CreateCampaignSchema } from './schemas/createCampaign.schema'
import { Prisma } from '@prisma/client'
import { deepMerge } from '../shared/util/objects.util'
import { caseInsensitiveCompare } from '../prisma/util/json.util'

const DEFAULT_FIND_ALL_INCLUDE = {
  user: {
    select: {
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      metaData: true,
    },
  },
  pathToVictory: {
    select: {
      data: true,
    },
  },
} as const

@Injectable()
export class CampaignsService {
  constructor(private prismaService: PrismaService) {}

  async findAll(
    query: CampaignListSchema,
    include: Prisma.CampaignInclude = DEFAULT_FIND_ALL_INCLUDE,
  ) {
    const args: Prisma.CampaignFindManyArgs = {
      include,
    }

    // if any filters are present, build where query object
    if (Object.values(query).some((value) => !!value)) {
      args.where = buildCampaignListFilters(query)
    }

    const campaigns = await this.prismaService.campaign.findMany(args)

    // TODO: still need this?
    // const campaignVolunteersMapping = await CampaignVolunteer.find({
    //   campaign: campaigns.map((campaign) => campaign.id),
    // }).populate('user');
    // campaigns = attachTeamMembers(campaigns, campaignVolunteersMapping)

    return campaigns
  }

  findOne(
    where: Prisma.CampaignWhereInput,
    include: Prisma.CampaignInclude = {
      pathToVictory: true,
    },
  ) {
    return this.prismaService.campaign.findFirst({
      where,
      include,
    })
  }

  async create(body: CreateCampaignSchema) {
    // TODO: get user from request
    // const { user } = this.req;
    // const userName = await sails.helpers.user.name(user);
    // if (userName === '') {
    //   console.log('No user name');
    //   return exits.badRequest('No user name');
    // }
    // const slug = await findSlug(userName);

    // TODO: see if the user already have campaign
    // const existing = await sails.helpers.campaign.byUser(user.id)
    // if (existing) {
    //   return exits.success({
    //     slug: existing.slug,
    //   })
    // }

    const newCampaign = await this.prismaService.campaign.create({
      data: {
        ...body,
        isActive: false,
        // TODO: pull from request user
        // userId:
        // details: {
        //   zip: user.zip,
        // },
        data: {
          slug: body.slug,
          currentStep: 'registration',
        },
      },
    })

    // TODO:
    // await claimExistingCampaignRequests(user, newCampaign)
    // await createCrmUser(user.firstName, user.lastName, user.email)

    return newCampaign
  }

  async update(id: number, body: UpdateCampaignSchema) {
    const { data, details, pathToVictory } = body

    return this.prismaService.$transaction(async (tx) => {
      const campaign = await tx.campaign.findFirst({
        where: { id },
        include: { pathToVictory: true },
      })

      if (!campaign) return false

      const updateData = {
        data: data ? deepMerge(campaign.data as object, data) : undefined,
        details: details
          ? deepMerge(campaign.details as object, details)
          : undefined,
      }

      if (pathToVictory && campaign.pathToVictory) {
        /// TODO:
        // if (pathToVictory.hasOwnProperty('viability')) {
        //   await updateViability(campaign, columnKey2, value)
        // } else {
        //   await updatePathToVictory(campaign, columnKey, value)
        // }

        updateData['pathToVictory'] = {
          update: {
            data: {
              data: deepMerge(
                campaign.pathToVictory.data as object,
                pathToVictory,
              ),
            },
          },
        }
      }

      // TODO:
      // try {
      //   await sails.helpers.crm.updateCampaign(updated)
      // } catch (e) {
      //   sails.helpers.log(campaign.slug, 'error updating crm', e)
      // }

      // try {
      //   await sails.helpers.fullstory.customAttr(user.id)
      // } catch (e) {
      //   sails.helpers.log(campaign.slug, 'error updating fullstory', e)
      // }

      return tx.campaign.update({
        where: { id: campaign.id },
        data: updateData,
        include: { pathToVictory: true },
      })
    })
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

// async function updatePathToVictory(campaign, columnKey, value) {
//   try {
//     const p2v = await PathToVictory.findOrCreate(
//       {
//         campaign: campaign.id,
//       },
//       {
//         campaign: campaign.id,
//       },
//     )

//     const data = p2v.data || {}
//     const updatedData = {
//       ...data,
//       [columnKey]: value,
//     }

//     await PathToVictory.updateOne({ id: p2v.id }).set({
//       data: updatedData,
//     })

//     if (!campaign.pathToVictory) {
//       await Campaign.updateOne({ id: campaign.id }).set({
//         pathToVictory: p2v.id,
//       })
//     }
//   } catch (e) {
//     console.log('Error at updatePathToVictory', e)
//     await sails.helpers.slack.errorLoggerHelper(
//       'Error at updatePathToVictory',
//       e,
//     )
//   }
// }

// async function updateViability(campaign, columnKey, value) {
//   try {
//     const p2v = await PathToVictory.findOrCreate(
//       {
//         campaign: campaign.id,
//       },
//       {
//         campaign: campaign.id,
//       },
//     )

//     const data = p2v.data || {}
//     const viability = data.viability || {}
//     const updatedData = {
//       ...data,
//       viability: {
//         ...viability,
//         [columnKey]: value,
//       },
//     }

//     await PathToVictory.updateOne({ id: p2v.id }).set({
//       data: updatedData,
//     })

//     if (!campaign.pathToVictory) {
//       await Campaign.updateOne({ id: campaign.id }).set({
//         pathToVictory: p2v.id,
//       })
//     }
//   } catch (e) {
//     console.log('Error at updateViability', e)
//     await sails.helpers.slack.errorLoggerHelper('Error at updateViability', e)
//   }
// }

function buildCampaignListFilters({
  id,
  state,
  slug,
  email,
  level,
  primaryElectionDateStart,
  primaryElectionDateEnd,
  campaignStatus,
  generalElectionDateStart,
  generalElectionDateEnd,
  p2vStatus,
}: CampaignListSchema): Prisma.CampaignWhereInput {
  // base query
  const where: Prisma.CampaignWhereInput = {
    NOT: {
      user: null,
    },
    AND: [],
  }

  // store AND array in var for easy push access
  const AND = where.AND as Prisma.CampaignWhereInput[]

  if (id) AND.push({ id })
  if (slug) AND.push({ slug: { equals: slug, mode: 'insensitive' } })
  if (email) {
    AND.push({
      user: {
        email: {
          equals: email,
          mode: 'insensitive',
        },
      },
    })
  }
  if (state) AND.push(caseInsensitiveCompare('details', ['state'], state))
  if (level) AND.push(caseInsensitiveCompare('details', ['ballotLevel'], level))
  if (campaignStatus) {
    AND.push({
      isActive: campaignStatus === 'active',
    })
  }
  if (p2vStatus) {
    AND.push({
      pathToVictory: caseInsensitiveCompare('data', ['p2vStatus'], p2vStatus),
    })
  }
  if (generalElectionDateStart) {
    AND.push({
      details: {
        path: ['electionDate'],
        gte: generalElectionDateStart,
      },
    })
  }
  if (generalElectionDateEnd) {
    AND.push({
      details: {
        path: ['electionDate'],
        lte: generalElectionDateEnd,
      },
    })
  }
  if (primaryElectionDateStart) {
    AND.push({
      details: {
        path: ['primaryElectionDate'],
        gte: primaryElectionDateStart,
      },
    })
  }
  if (primaryElectionDateEnd) {
    AND.push({
      details: {
        path: ['primaryElectionDate'],
        lte: primaryElectionDateEnd,
      },
    })
  }

  return where
}

// TODO: still need this?
// function attachTeamMembers(campaigns, campaignVolunteersMapping) {
//   const teamMembersMap = campaignVolunteersMapping.reduce(
//     (members, { user, campaign, role }) => {
//       const teamMember = {
//         ...user,
//         role,
//       }

//       return {
//         ...members,
//         [campaign]: members[campaign]
//           ? [...members[campaign], teamMember]
//           : [teamMember],
//       }
//     },
//     {},
//   )

//   return campaigns.map((campaign) => ({
//     ...campaign,
//     teamMembers: teamMembersMap[campaign.id] || [],
//   }))
// }
