import { NotFoundException } from '@nestjs/common'
import { Organization } from '../generated/prisma'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ElectionsService } from '@/elections/services/elections.service'
import { OrganizationsService } from '@/organizations/services/organizations.service'
import { OnboardingVoterIssuesController } from './onboardingVoterIssues.controller'

describe('OnboardingVoterIssuesController', () => {
  let controller: OnboardingVoterIssuesController
  let getVoterIssues: ReturnType<typeof vi.fn>
  let getDistrictAndLevelForOrgSlug: ReturnType<typeof vi.fn>

  const organization = { slug: 'org-slug' } as Organization

  beforeEach(() => {
    getVoterIssues = vi.fn()
    getDistrictAndLevelForOrgSlug = vi.fn()
    controller = new OnboardingVoterIssuesController(
      { getVoterIssues } as unknown as ElectionsService,
      { getDistrictAndLevelForOrgSlug } as unknown as OrganizationsService,
    )
  })

  it('forwards the district and office level to the elections service', async () => {
    getDistrictAndLevelForOrgSlug.mockResolvedValue({
      district: { id: 'd-1', l2Type: 'City', l2Name: 'Poway city' },
      level: 'local',
    })
    const issues = [
      { label: 'Development', score: 78, priority: 'high' as const },
    ]
    getVoterIssues.mockResolvedValue(issues)

    const result = await controller.getVoterIssues(organization)

    expect(getDistrictAndLevelForOrgSlug).toHaveBeenCalledWith('org-slug')
    expect(getVoterIssues).toHaveBeenCalledWith({
      districtId: 'd-1',
      level: 'local',
    })
    expect(result).toEqual({ issues })
  })

  it('coerces a null upstream response to an empty issues array', async () => {
    getDistrictAndLevelForOrgSlug.mockResolvedValue({
      district: { id: 'd-1', l2Type: 'City', l2Name: 'Poway city' },
      level: 'local',
    })
    getVoterIssues.mockResolvedValue(null)

    const result = await controller.getVoterIssues(organization)

    expect(result).toEqual({ issues: [] })
  })

  it('returns no issues when the office level cannot be resolved', async () => {
    getDistrictAndLevelForOrgSlug.mockResolvedValue({
      district: { id: 'd-1', l2Type: 'City', l2Name: 'Poway city' },
      level: null,
    })

    const result = await controller.getVoterIssues(organization)

    expect(result).toEqual({ issues: [] })
    expect(getVoterIssues).not.toHaveBeenCalled()
  })

  it('throws NotFoundException when the organization has no district', async () => {
    getDistrictAndLevelForOrgSlug.mockResolvedValue({
      district: null,
      level: null,
    })

    await expect(controller.getVoterIssues(organization)).rejects.toThrow(
      new NotFoundException(
        'No district associated with organization "org-slug"',
      ),
    )
    expect(getVoterIssues).not.toHaveBeenCalled()
  })
})
