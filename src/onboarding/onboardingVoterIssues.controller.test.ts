import { NotFoundException } from '@nestjs/common'
import { Organization } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ElectionsService } from '@/elections/services/elections.service'
import { OrganizationsService } from '@/organizations/services/organizations.service'
import { OnboardingVoterIssuesController } from './onboardingVoterIssues.controller'

describe('OnboardingVoterIssuesController', () => {
  let controller: OnboardingVoterIssuesController
  let getVoterIssues: ReturnType<typeof vi.fn>
  let getDistrictForOrgSlug: ReturnType<typeof vi.fn>

  const organization = { slug: 'org-slug' } as Organization

  beforeEach(() => {
    getVoterIssues = vi.fn()
    getDistrictForOrgSlug = vi.fn()
    controller = new OnboardingVoterIssuesController(
      { getVoterIssues } as unknown as ElectionsService,
      { getDistrictForOrgSlug } as unknown as OrganizationsService,
    )
  })

  it('resolves the district from the organization and forwards to elections service', async () => {
    getDistrictForOrgSlug.mockResolvedValue({
      id: 'd-1',
      l2Type: 'City',
      l2Name: 'Los Angeles',
    })
    const issues = [
      { label: 'Education', score: 88, priority: 'high' as const },
    ]
    getVoterIssues.mockResolvedValue(issues)

    const result = await controller.getVoterIssues(organization)

    expect(getDistrictForOrgSlug).toHaveBeenCalledWith('org-slug')
    expect(getVoterIssues).toHaveBeenCalledWith({ districtId: 'd-1' })
    expect(result).toEqual({ issues })
  })

  it('coerces a null upstream response to an empty issues array', async () => {
    getDistrictForOrgSlug.mockResolvedValue({
      id: 'd-1',
      l2Type: 'City',
      l2Name: 'Los Angeles',
    })
    getVoterIssues.mockResolvedValue(null)

    const result = await controller.getVoterIssues(organization)

    expect(result).toEqual({ issues: [] })
  })

  it('throws NotFoundException when the organization has no district', async () => {
    getDistrictForOrgSlug.mockResolvedValue(null)

    await expect(controller.getVoterIssues(organization)).rejects.toThrow(
      new NotFoundException(
        'No district associated with organization "org-slug"',
      ),
    )
    expect(getVoterIssues).not.toHaveBeenCalled()
  })
})
