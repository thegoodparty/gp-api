import { useTestService } from '@/test-service'
import { HttpStatus } from '@nestjs/common'
import { CampaignTask as PrismaCampaignTask } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { CampaignTaskType } from '../campaignTasks.types'

const service = useTestService()

const TASKS_BASE_PATH = '/v1/campaigns/tasks'
const ORG_SLUG = 'campaign-org-tasks-test'
const orgHeaders = {
  headers: { 'x-organization-slug': ORG_SLUG },
}

async function createCampaignWithTasks() {
  const org = await service.prisma.organization.create({
    data: {
      slug: ORG_SLUG,
      ownerId: service.user.id,
    },
  })

  const campaign = await service.prisma.campaign.create({
    data: {
      userId: service.user.id,
      slug: 'tasks-test-campaign',
      details: {},
      organizationSlug: org.slug,
    },
  })

  await service.prisma.campaignTask.createMany({
    data: [
      {
        campaignId: campaign.id,
        title: 'Introduction Text',
        description: 'Introduce yourself to voters',
        cta: 'Schedule',
        flowType: CampaignTaskType.text,
        week: 4,
        date: new Date('2026-06-01'),
        proRequired: true,
        isDefaultTask: true,
        completed: false,
      },
      {
        campaignId: campaign.id,
        title: 'Persuasion Text',
        description: 'Build trust and persuade voters',
        cta: 'Schedule',
        flowType: CampaignTaskType.text,
        week: 2,
        date: new Date('2026-07-01'),
        proRequired: true,
        isDefaultTask: true,
        completed: false,
      },
      {
        campaignId: campaign.id,
        title: 'AI Generated Task',
        description: 'Task from AI campaign manager',
        cta: 'Get started',
        flowType: CampaignTaskType.socialMedia,
        week: 3,
        date: new Date('2026-08-01'),
        proRequired: false,
        isDefaultTask: false,
        completed: false,
      },
    ],
  })

  return campaign
}

describe('Campaigns Tasks - List Tasks', () => {
  it('lists all tasks', async () => {
    await createCampaignWithTasks()

    const result = await service.client.get<PrismaCampaignTask[]>(
      TASKS_BASE_PATH,
      orgHeaders,
    )

    expect(result.status).toBe(HttpStatus.OK)
    expect(Array.isArray(result.data)).toBe(true)
    expect(result.data.length).toBe(3)

    const ids = new Set(result.data.map((t) => t.id))
    expect(ids.size).toBe(result.data.length)
  })

  it('returns tasks ordered by week descending', async () => {
    await createCampaignWithTasks()

    const result = await service.client.get<PrismaCampaignTask[]>(
      TASKS_BASE_PATH,
      orgHeaders,
    )

    expect(result.status).toBe(HttpStatus.OK)
    expect(result.data.length).toBeGreaterThan(0)

    for (let i = 1; i < result.data.length; i++) {
      expect(result.data[i - 1].week).toBeGreaterThanOrEqual(
        result.data[i].week,
      )
    }
  })

  it('ignores date query params and returns all tasks', async () => {
    await createCampaignWithTasks()

    const date = '2025-03-25T21:17:31.648Z'
    const endDate = '2025-04-01T21:17:31.648Z'

    const [allResult, filteredResult] = await Promise.all([
      service.client.get<PrismaCampaignTask[]>(TASKS_BASE_PATH, orgHeaders),
      service.client.get<PrismaCampaignTask[]>(
        `${TASKS_BASE_PATH}?date=${date}&endDate=${endDate}`,
        orgHeaders,
      ),
    ])

    expect(allResult.status).toBe(HttpStatus.OK)
    expect(filteredResult.status).toBe(HttpStatus.OK)
    expect(allResult.data.length).toBe(filteredResult.data.length)
  })
})
