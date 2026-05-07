import { Body, Controller, Get, Param, Post, UseGuards, UsePipes } from '@nestjs/common'
import { Organization } from '@prisma/client'
import { ZodValidationPipe } from 'nestjs-zod'
import { AdminOrM2MGuard } from '@/authentication/guards/AdminOrM2M.guard'
import { UseElectedOffice } from '@/electedOffice/decorators/UseElectedOffice.decorator'
import { ReqOrganization } from '@/organizations/decorators/ReqOrganization.decorator'
import { UseOrganization } from '@/organizations/decorators/UseOrganization.decorator'
import { OnboardElectedOfficeDto } from '../schemas/onboardElectedOffice.schema'
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
   * GET /meetings/onboard/elected-office/:id
   * Admin preview for meeting-briefings onboarding (no writes).
   */
  @Get('onboard/elected-office/:id')
  @UseGuards(AdminOrM2MGuard)
  async previewOnboardElectedOffice(@Param('id') id: string) {
    return this.meetingsService.getOnboardingPreview(id)
  }

  /**
   * POST /meetings/onboard/elected-office/:id
   * Publish manifest.json and enqueue discover (admin / M2M only).
   */
  @Post('onboard/elected-office/:id')
  @UseGuards(AdminOrM2MGuard)
  @UsePipes(ZodValidationPipe)
  async onboardElectedOffice(
    @Param('id') id: string,
    @Body() body: OnboardElectedOfficeDto,
  ) {
    return this.meetingsService.onboardElectedOffice(id, body)
  }

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
