import { describe, expect, it } from 'vitest'
import { ExperimentRunStatus } from '../../generated/prisma'
import { useTestService } from '@/test-service'
import { AdminBriefingsService } from './services/adminBriefings.service'

const service = useTestService()

const seedBriefing = async ({
  orgSlug,
  userId,
  meetingDate,
  meetingName,
  customPositionName,
}: {
  orgSlug: string
  userId: number
  meetingDate: string
  meetingName?: string
  customPositionName?: string
}) => {
  await service.prisma.organization.create({
    data: { slug: orgSlug, ownerId: userId, customPositionName },
  })
  const eo = await service.prisma.electedOffice.create({
    data: { organizationSlug: orgSlug, userId },
  })
  const run = await service.prisma.experimentRun.create({
    data: {
      organizationSlug: orgSlug,
      experimentType: 'meeting_briefing',
      status: ExperimentRunStatus.COMPLETED,
    },
  })
  return service.prisma.meetingBriefing.create({
    data: {
      electedOfficeId: eo.id,
      meetingDate: new Date(meetingDate + 'T00:00:00Z'),
      meetingTime: '19:00',
      meetingTimezone: 'America/Denver',
      experimentRunId: run.runId,
      artifactBucket: 'b',
      artifactKey: `${meetingDate}.json`,
      artifact: meetingName ? { meeting_name: meetingName } : undefined,
    },
  })
}

describe('AdminBriefingsService.list', () => {
  it('returns rows joined to the owning user and office', async () => {
    const briefings = service.app.get(AdminBriefingsService)
    const briefing = await seedBriefing({
      orgSlug: 'eo-admin-list',
      userId: service.user.id,
      meetingDate: '2026-06-09',
      meetingName: 'City Council Regular Session',
      customPositionName: 'City Council Member',
    })

    const result = await briefings.list({})

    const row = result.data.find((r) => r.briefingId === briefing.id)
    expect(row).toBeDefined()
    expect(row?.meetingDate).toBe('2026-06-09')
    expect(row?.meetingName).toBe('City Council Regular Session')
    expect(row?.user.id).toBe(service.user.id)
    expect(row?.electedOffice.organizationSlug).toBe('eo-admin-list')
    expect(row?.electedOffice.positionName).toBe('City Council Member')
  })

  it('filters by fuzzy name/email query', async () => {
    const briefings = service.app.get(AdminBriefingsService)
    const match = await service.prisma.user.create({
      data: {
        clerkId: 'admin_q_match',
        email: 'zelda@goodparty.org',
        firstName: 'Zelda',
        lastName: 'Fitzgerald',
      },
    })
    await seedBriefing({
      orgSlug: 'eo-q-match',
      userId: match.id,
      meetingDate: '2026-06-10',
    })

    const result = await briefings.list({ q: 'zelda' })

    expect(result.data.length).toBeGreaterThan(0)
    expect(
      result.data.every((r) => r.user.email === 'zelda@goodparty.org'),
    ).toBe(true)
  })
})
