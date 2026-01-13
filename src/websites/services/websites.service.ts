import { Injectable } from '@nestjs/common'
import { Prisma, User } from '@prisma/client'
import { CampaignWith } from 'src/campaigns/campaigns.types'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { getUserFullName } from 'src/users/util/users.util'

type PositionWithTopIssue = Prisma.CampaignPositionGetPayload<{
  include: { topIssue: true }
}>

@Injectable()
export class WebsitesService extends createPrismaBase(MODELS.Website) {
  createByCampaign(user: User, campaign: CampaignWith<'campaignPositions'>) {
    const campaignPositions =
      campaign.campaignPositions as PositionWithTopIssue[]
    const issues = campaignPositions.map((position, index) => ({
      title: position.topIssue?.name ?? `Issue ${index + 1}`,
      description: position.description ?? `Issue ${index + 1} description`,
    }))

    // NOTE: this is in a WIP state, better default content generation TBD
    // TODO: generate AI content here for any missing fields
    return this.model.create({
      data: {
        campaignId: campaign.id,
        vanityPath: campaign.slug,
        content: {
          theme: 'light',
          main: {
            title: `Vote For ${getUserFullName(user)}`,
            tagline: 'Local Solutions, Not Party Politics',
          },
          about: {
            issues,
          },
          contact: {
            email: user.email,
            phone: user.phone ?? undefined,
          },
        },
      },
    })
  }

  update(args: Prisma.WebsiteUpdateArgs) {
    return this.model.update(args)
  }

  async findByDomainName(domainName: string, include?: Prisma.WebsiteInclude) {
    const domainRecord = await this.client.domain.findUniqueOrThrow({
      where: { name: domainName },
      include: {
        website: {
          include,
        },
      },
    })

    return domainRecord.website
  }
}
