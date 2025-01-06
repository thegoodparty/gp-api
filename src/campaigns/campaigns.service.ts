import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { UpdateCampaignSchema } from './schemas/updateCampaign.schema'
import { CampaignListSchema } from './schemas/campaignList.schema'
import { CreateCampaignSchema } from './schemas/createCampaign.schema'
import { Prisma, User } from '@prisma/client'
import { deepMerge } from 'src/shared/util/objects.util'
import { caseInsensitiveCompare } from 'src/prisma/util/json.util'
import {
  Campaign,
  CampaignDataContent,
  CampaignDetailsContent,
  CleanCampaign,
} from './campaigns.types'
import { zipToLatLng } from './util/zipToLatLng'
import { number } from 'zod'

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

    return campaigns as Campaign[]
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
    }) as Promise<Campaign>
  }

  findByUser(userId: Prisma.CampaignWhereInput['userId']) {
    return this.prismaService.campaign.findFirstOrThrow({
      where: { userId },
    }) as Promise<Campaign>
  }

  async create(campaignData: CreateCampaignSchema, user: User) {
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
        ...campaignData,
        isActive: false,
        userId: user.id,
        details: {
          zip: user.zip,
        },
        data: {
          slug: campaignData.slug,
          currentStep: 'registration',
        },
      },
    })

    // TODO:
    // await claimExistingCampaignRequests(user, newCampaign)
    // await createCrmUser(user.firstName, user.lastName, user.email)

    return newCampaign as Campaign
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
      }) as Promise<Campaign>
    })
  }

  async listMapCount(
    state?: string,
    results?: boolean,
  ): Promise<{ count: number }> {
    // Config to check APP_BASE ?

    // let whereClauses = `WHERE c."user_id" IS NOT NULL AND c."isDemo" = false AND c."isActive" = true`

    // if (state) {
    //   whereClauses += ` AND c.details->>'state' = '${state}`
    // }

    // if (results) {
    //   whereClauses += ` AND (c."didWin" = true OR c.data->'hubSpotUpdates'->>'election_results' = 'Won General')`
    // }

    // const rawQuery = `
    //   SELECT
    //       c."slug",
    //       c."details",
    //       c."didWin",
    //       c."data",
    //       u."firstName",
    //       u."lastName",
    //       u."avatar"
    //     FROM "campaign" c
    //     JOIN "user" u ON c."user" = u.id
    //     ${whereClauses};
    //   `

    // const campaigns = await this.prismaService.$queryRawUnsafe<
    //   {
    //     slug: string
    //     details: any
    //     didWin: boolean | null
    //     data: any
    //     firstName: string
    //     lastName: string
    //     avatar: string
    //   }[]
    // >(rawQuery)

    const whereClause: Prisma.CampaignWhereInput = {
      userId: { not: null },
      isDemo: false,
      isActive: true,
      ...(state
        ? {
            details: {
              path: ['state'],
              equals: state,
            },
          }
        : {}),
      ...(results
        ? {
            OR: [
              { didWin: true },
              {
                data: {
                  path: ['hubSpotUpdates', 'election_results'],
                  equals: 'Won General',
                },
              },
            ],
          }
        : {}),
    }

    const campaigns = await this.prismaService.campaign.findMany({
      where: whereClause,
      select: {
        slug: true,
        details: true,
        didWin: true,
        data: true,
        user: {
          select: {
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
      },
    })

    const lastWeek = new Date()
    lastWeek.setDate(lastWeek.getDate() - 7)
    let count = 0

    for (const campaign of campaigns) {
      const { didWin, slug } = campaign
      const details = campaign.details as CampaignDetailsContent
      const data = campaign.data as CampaignDataContent

      if (
        !details?.zip ||
        didWin === false ||
        !details?.geoLocation?.lng ||
        details?.geoLocationFailed
      ) {
        if (slug === 'tego sol victoria caelum vestrum') {
          console.log('Failed first check')
        }
        continue
      }
      const isProd = false // Change this later

      if (isProd) {
        if (data?.hubSpotUpdates?.verified_candidates !== 'Yes') {
          if (slug === 'tego sol victoria caelum vestrum') {
            console.log('Failed second check')
          }
          continue
        }
      }

      if (didWin == null) {
        if (!details.electionDate) {
          continue
        }
        const electionDate = new Date(details.electionDate)
        if (electionDate < lastWeek) {
          if (slug === 'tego sol victoria caelum vestrum') {
            console.log('Failed fourth check')
          }
          continue
        }
      }

      count++
    }

    return { count }
  }

  async listMap(
    party?: string,
    state?: string,
    level?: string,
    results?: string,
    office?: string,
    name?: string,
    forceReCalc?: boolean,
  ): Promise<CleanCampaign[]> {
    // Logic for checking appbase?

    const andConditions: any = []

    if (party) {
      andConditions.push({
        details: {
          path: ['party'],
          contains: party.toLowerCase(),
        },
      })
    }

    if (state) {
      andConditions.push({
        details: {
          path: ['state'],
          equals: state,
        },
      })
    }

    if (level) {
      andConditions.push({
        details: {
          path: ['ballotLevel'],
          equals: level,
        },
      })
    }

    if (results) {
      andConditions.push({
        OR: [
          { didWin: true },
          {
            data: {
              path: ['hubSpotUpdates', 'election_results'],
              equals: 'Won General',
            },
          },
        ],
      })
    }

    if (office) {
      andConditions.push({
        OR: [
          {
            details: {
              path: ['normalizedOffice'],
              equals: office,
            },
          },
          {
            details: {
              path: ['office'],
              equals: office,
            },
          },
          {
            details: {
              path: ['otherOffice'],
              equals: office,
            },
          },
        ],
      })
    }

    const isProd = false

    if (isProd) {
      andConditions.push({
        data: {
          path: ['hubSpotUpdates', 'verified_candidates'],
          equals: 'Yes',
        },
      })
    }

    const where: Prisma.CampaignWhereInput = {
      userId: {
        not: null,
      },
      isDemo: false,
      isActive: true,
      AND: andConditions,
    }

    const campaigns = await this.prismaService.campaign.findMany({
      where,
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
      },
    })

    const cleanCampaigns: CleanCampaign[] = []
    const lastWeek = new Date()
    lastWeek.setDate(lastWeek.getDate() - 7)

    for (const campaign of campaigns) {
      const { didWin, slug } = campaign
      const details = campaign.details as CampaignDetailsContent
      const data = campaign.data as CampaignDataContent

      if (!details?.zip || didWin === false) {
        continue
      }

      const {
        otherOffice,
        office,
        state,
        ballotLevel,
        zip,
        party,
        raceId,
        noNormalizedOffice,
        county,
        city,
      } = details || {}

      const electionDate = details.electionDate as string

      const resolvedOffice = (otherOffice as string) || (office as string)
      if (name) {
        const fullName =
          `${campaign?.user?.firstName} ${campaign?.user?.lastName}`.toLowerCase()
        if (!fullName.includes(name.toLowerCase())) {
          continue
        }
      }
      const hubSpotOffice = data?.hubSpotUpdates?.office_type
      let normalizedOffice = hubSpotOffice || details?.normalizedOffice

      if (!normalizedOffice && raceId && !noNormalizedOffice) {
        const race = await this.prismaService.race.findFirst({
          where: { ballotHashId: raceId },
        })
        if (
          typeof race?.data === 'object' &&
          !Array.isArray(race?.data) &&
          typeof race?.data?.normalized_position_name === 'string' // Come back to this hot mess
        ) {
          normalizedOffice = race?.data?.normalized_position_name
        }
        if (normalizedOffice) {
          await this.prismaService.campaign.update({
            where: { slug },
            data: { details: { ...details, normalizedOffice } },
          })
        } else {
          await this.prismaService.campaign.update({
            where: { slug },
            data: { details: { ...details, noNormalizedOffice: true } },
          })
        }
      }

      const cleanCampaign = {
        slug,
        id: slug,
        didWin,
        office: resolvedOffice,
        state,
        ballotLevel,
        zip,
        party,
        firstName: campaign.user?.firstName,
        lastName: campaign.user?.lastName,
        avatar: campaign.user?.avatar || false,
        electionDate,
        county,
        city,
        normalizedOffice: normalizedOffice || resolvedOffice,
      }

      if (didWin === null) {
        const date = new Date(electionDate)
        if (date < lastWeek) {
          continue
        }
      }

      const position = await handleGeoLocation(
        campaign as Campaign,
        forceReCalc,
        this.prismaService,
      )
      if (!position) {
        continue
      } else {
        cleanCampaign.position = position
      }

      cleanCampaigns.push(cleanCampaign)
    }
  }
}

async function handleGeoLocation(
  campaign: Campaign,
  forceReCalc: boolean | undefined,
  prismaService: PrismaService,
) {
  const details = campaign.details as CampaignDetailsContent
  const { geoLocationFailed, geoLocation } = details || {}

  if (!forceReCalc && geoLocationFailed) {
    return false
  }

  if (forceReCalc || !geoLocation?.lng) {
    const geoLocation = await calculateGeoLocation(campaign, prismaService)
    if (!geoLocation) {
      await prismaService.campaign.update({
        where: {
          slug: campaign.slug,
        },
        data: {
          details: {
            ...details,
            geoLocationFailed: true,
          },
        },
      })
      return false
    }
    return { lng: geoLocation.lng, lat: geoLocation.lat }
  } else {
    return {
      lng: campaign.details.geoLocation?.lng,
      lat: campaign.details.geoLocation?.lat,
    }
  }
}

async function calculateGeoLocation(
  campaign: Campaign,
  prismaService: PrismaService,
): Promise<{ lat: number; lng: number; geoHash: string } | null> {
  if (!campaign.details?.zip || !campaign.details?.state) {
    return null
  }
  const globalCoords = await zipToLatLng(
    campaign.details?.zip,
    campaign.details?.state,
  )
  if (globalCoords == null) {
    return null
  }
  const { lat, lng, geoHash } = globalCoords
  await prismaService.campaign.update({
    where: {
      slug: campaign.slug,
    },
    data: {
      details: {
        ...(campaign.details as CampaignDetailsContent),
        geoLocationFailed: false,
        geoLocation: {
          geoHash,
          lat,
          lng,
        },
      },
    },
  })
  return { lng, lat, geoHash }
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
