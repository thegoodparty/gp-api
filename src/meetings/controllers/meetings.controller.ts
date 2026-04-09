import { Controller, Get, Param } from '@nestjs/common'
import { Organization } from '@prisma/client'
import { UseElectedOffice } from '@/electedOffice/decorators/UseElectedOffice.decorator'
import { ReqOrganization } from '@/organizations/decorators/ReqOrganization.decorator'
import { UseOrganization } from '@/organizations/decorators/UseOrganization.decorator'
import { MeetingsService } from '../services/meetings.service'

/**
 * Briefings endpoints for elected officials.
 *
 * All routes require:
 * - A valid user session (JWT)
 * - UseElectedOffice guard — resolves elected office from X-Organization-Slug header
 * - UseOrganization guard — resolves the organization (carries positionId + overrideDistrictId)
 *
 * The organization is used to derive citySlug via election-api, which is then
 * used to look up briefing JSON files from S3.
 */
@Controller('meetings')
export class MeetingsController {
  constructor(private readonly meetingsService: MeetingsService) {}

  /**
   * GET /meetings/briefings
   * List all available briefings for the current official's city, most recent first.
   */
  @Get('briefings')
  @UseElectedOffice()
  @UseOrganization()
  async listBriefings(@ReqOrganization() org: Organization) {
    return this.meetingsService.listBriefings(org)
  }

  /**
   * GET /meetings/briefings/:date
   * Get the full briefing for a specific meeting date (YYYY-MM-DD).
   */
  @Get('briefings/:date')
  @UseElectedOffice()
  @UseOrganization()
  async getBriefing(
    @ReqOrganization() org: Organization,
    @Param('date') date: string,
  ) {
    return this.meetingsService.getBriefing(org, date)
  }
}
