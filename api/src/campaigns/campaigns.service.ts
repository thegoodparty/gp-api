import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'
import { UpdateCampaignBody } from './schemas/updateCampaign.schema'
import { CampaignListQuery } from './schemas/campaignList.schema'
import { CreateCampaignBody } from './schemas/createCampaign.schema'
import { Prisma } from '@prisma/client'
import { deepMerge } from 'src/shared/util/objects.util'

@Injectable()
export class CampaignsService {
  constructor(private prismaService: PrismaService) {}

  async findAll(
    query: CampaignListQuery,
    include: Prisma.CampaignInclude = {
      user: true,
      pathToVictory: true,
    },
  ) {
    let campaigns

    if (Object.values(query).every((value) => !value)) {
      // if values are empty get all campaigns
      campaigns = await this.prismaService.campaign.findMany({
        include,
      })
    } else {
      const sql = buildCustomCampaignListQuery(query)
      campaigns = await this.prismaService.$queryRawUnsafe(sql)
    }

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

  async create(body: CreateCampaignBody) {
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

  async update(id: number, body: UpdateCampaignBody) {
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

function buildQueryWhereClause({
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
}) {
  return `
  ${id ? ` AND c.id = ${id}` : ''}
  ${slug ? ` AND c.slug ILIKE '%${slug}%'` : ''}
  ${email ? ` AND u.email ILIKE '%${email}%'` : ''}
  ${state ? ` AND c.details->>'state' = '${state}'` : ''}
  ${level ? ` AND c.details->>'ballotLevel' = '${level.toUpperCase()}'` : ''}
  ${
    campaignStatus
      ? ` AND c.is_active = ${campaignStatus === 'active' ? 'true' : 'false'}`
      : ''
  }
  ${
    primaryElectionDateStart
      ? ` AND c.details->>'primaryElectionDate' >= '${primaryElectionDateStart}'`
      : ''
  }
  ${
    primaryElectionDateEnd
      ? ` AND c.details->>'primaryElectionDate' <= '${primaryElectionDateEnd}'`
      : ''
  }
  ${
    generalElectionDateStart
      ? ` AND c.details->>'electionDate' >= '${generalElectionDateStart}'`
      : ''
  }
  ${
    generalElectionDateEnd
      ? ` AND c.details->>'electionDate' <= '${generalElectionDateEnd}'`
      : ''
  }
  ${p2vStatus ? ` AND p.data->>'p2vStatus' = '${p2vStatus}'` : ''}
`
}

function buildCustomCampaignListQuery({
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
}: Partial<CampaignListQuery>) {
  // TODO: This ends up spreading the `user` record across the response object
  //  instead of nesting it under `campaign.user` as it should be
  return `
  SELECT
    c.*,
    u.first_name as "first_name",
    u.last_name as "last_name",
    u.phone as "phone",
    u.email as "email",
    u.meta_data,
    p.data as "pathToVictory"
  FROM public.campaigns AS c
  JOIN public.users AS u ON u.id = c.user_id
  LEFT JOIN public.path_to_victory as p ON p.campaign_id = c.id
  WHERE c.user_id IS NOT NULL
  ${buildQueryWhereClause({
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
  })}
  ORDER BY c.id DESC;
`
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
