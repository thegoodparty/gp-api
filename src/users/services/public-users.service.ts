import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { FindByOfficeDto } from '../schemas/public/FindByOffice.schema'
import { 
  FindByOfficeResponseDto 
} from '../schemas/public/FindByOfficeResponse.schema'
import { 
  UserProfileResponseDto 
} from '../schemas/public/UserProfile.schema'

@Injectable()
export class PublicUsersService extends createPrismaBase(MODELS.User) {
  public readonly logger = new Logger(PublicUsersService.name)

  async findUserByOffice(params: FindByOfficeDto): Promise<FindByOfficeResponseDto> {
    const { firstName, lastName, office, state } = params

    try {
      // Simple query: find users by last name with campaigns matching office and state
      const users = await this.findMany({
        where: {
          lastName: {
            equals: lastName,
            mode: 'insensitive'
          },
          campaigns: {
            some: {
              AND: [
                {
                  OR: [
                    {
                      details: {
                        path: ['office'],
                        string_contains: office
                      }
                    },
                    {
                      details: {
                        path: ['normalizedOffice'],
                        string_contains: office
                      }
                    },
                    {
                      details: {
                        path: ['otherOffice'],
                        string_contains: office
                      }
                    }
                  ]
                },
                {
                  details: {
                    path: ['state'],
                    equals: state
                  }
                }
              ]
            }
          }
        },
        include: {
          campaigns: {
            where: {
              AND: [
                {
                  OR: [
                    {
                      details: {
                        path: ['office'],
                        string_contains: office
                      }
                    },
                    {
                      details: {
                        path: ['normalizedOffice'],
                        string_contains: office
                      }
                    },
                    {
                      details: {
                        path: ['otherOffice'],
                        string_contains: office
                      }
                    }
                  ]
                },
                {
                  details: {
                    path: ['state'],
                    equals: state
                  }
                }
              ]
            },
            select: {
              id: true,
              details: true,
              isActive: true
            }
          }
        }
      })

      if (users.length === 0) {
        return { 
          userId: null, 
          message: 'No matching user found' 
        }
      }

      // If multiple users found, try to match by first name
      let matchedUser = users[0]
      if (users.length > 1) {
        const exactMatch = users.find(user => 
          user.firstName?.toLowerCase() === firstName.toLowerCase()
        )
        if (exactMatch) {
          matchedUser = exactMatch
        }
      }

      // Calculate confidence based on first name match
      const firstNameMatch = 
        matchedUser.firstName?.toLowerCase() === firstName.toLowerCase()
      const confidence = firstNameMatch ? 1.0 : 0.8

      return {
        userId: matchedUser.id,
        confidence,
        race: {
          id: `${office}-${state}`,
          office: office,
          location: `${params.municipality || ''}, ${state}`.trim()
        }
      }

    } catch (error) {
      this.logger.error('Error in findUserByOffice:', error)
      return { 
        userId: null, 
        message: 'An error occurred while searching for user' 
      }
    }
  }

  async getUserProfile(userId: number): Promise<UserProfileResponseDto | null> {
    try {
      const user = await this.findUnique({
        where: { id: userId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          name: true,
          avatar: true,
          campaigns: {
            select: {
              id: true,
              slug: true,
              isActive: true,
              details: true,
              topIssues: {
                select: {
                  id: true,
                  name: true
                }
              },
              campaignPositions: {
                select: {
                  id: true,
                  description: true,
                  order: true,
                  position: {
                    select: {
                      id: true,
                      name: true,
                      topIssue: {
                        select: {
                          id: true,
                          name: true
                        }
                      }
                    }
                  },
                  topIssue: {
                    select: {
                      id: true,
                      name: true
                    }
                  }
                },
                orderBy: {
                  order: 'asc'
                }
              }
            },
            orderBy: [
              { isActive: 'desc' },
              { updatedAt: 'desc' }
            ]
          }
        }
      })

      if (!user) {
        return null
      }

      // Transform the data to match the schema
      const transformedUser = {
        ...user,
        campaigns: user.campaigns.map(campaign => ({
          ...campaign,
          details: this.extractCampaignDetails(campaign.details)
        }))
      }

      return transformedUser as UserProfileResponseDto

    } catch (error) {
      this.logger.error('Error in getUserProfile:', error)
      return null
    }
  }

  private extractCampaignDetails(details: any): any {
    if (!details || typeof details !== 'object') {
      return {}
    }

    return {
      office: details.office,
      state: details.state,
      city: details.city,
      normalizedOffice: details.normalizedOffice,
      campaignCommittee: details.campaignCommittee,
      occupation: details.occupation,
      party: details.party,
      website: details.website,
      pastExperience: details.pastExperience,
      funFact: details.funFact,
    }
  }
} 