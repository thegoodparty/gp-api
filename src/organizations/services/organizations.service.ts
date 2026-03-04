import { ElectionsService } from '@/elections/services/elections.service'
import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import { Organization } from '@prisma/client'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'

export type OrganizationWithPosition = Awaited<
  ReturnType<OrganizationsService['withPosition']>
>

@Injectable()
export class OrganizationsService extends createPrismaBase(
  MODELS.Organization,
) {
  constructor(private readonly electionsService: ElectionsService) {
    super()
  }

  static campaignOrgSlug(campaignId: number): string {
    return `campaign-${campaignId}`
  }

  static electedOfficeOrgSlug(electedOfficeId: string): string {
    return `eo-${electedOfficeId}`
  }

  static resolveCustomPositionName(
    office?: string,
    otherOffice?: string,
  ): string | null {
    const resolved = office === 'Other' ? otherOffice : office
    return resolved || null
  }

  async listOrganizations(userId: number) {
    const orgs = await this.model.findMany({ where: { ownerId: userId } })
    return await Promise.all(orgs.map((org) => this.withPosition(org)))
  }

  async getOrganization(userId: number, slug: string) {
    const org = await this.model.findUnique({
      where: { slug, ownerId: userId },
    })
    if (!org) {
      throw new NotFoundException('Organization not found')
    }

    return this.withPosition(org)
  }

  private async withPosition(org: Organization) {
    if (!org.positionId) {
      return { ...org, position: null }
    }
    const position = await this.electionsService.getPositionById(org.positionId)
    if (!position) {
      this.logger.error(
        { org },
        'Organization references a non-existent position',
      )
      throw new InternalServerErrorException(
        'Organization references a non-existent position',
      )
    }
    return { ...org, position }
  }
}
