import { Injectable } from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { WebsiteDomainStatus, Prisma, User } from '@prisma/client'
import { CampaignWith } from 'src/campaigns/campaigns.types'

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

    const campaignName = campaign.data.name || user.name || 'Candidate Name'

    // NOTE: this is in a WIP state, better default content generation TBD
    // TODO: generate AI content here for any missing fields
    return this.model.create({
      data: {
        campaignId: campaign.id,
        vanityPath: campaign.slug,
        content: {
          campaignName,
          main: {
            title: `Vote For ${campaignName}`,
            tagline: 'Candidate Tagline',
          },
          about: {
            bio: 'About the candidate',
            issues,
          },
          contact: {
            address: '123 Main St, Anytown, USA',
            email: user.email,
            phone: user.phone ?? '(555) 123-4567',
          },
        },
      },
    })
  }

  setDomain(campaignId: number, domain: string) {
    return this.model.update({
      where: { campaignId },
      data: { domain, domainStatus: WebsiteDomainStatus.pending },
    })
  }

  update(args: Prisma.WebsiteUpdateArgs) {
    return this.model.update(args)
  }
}
