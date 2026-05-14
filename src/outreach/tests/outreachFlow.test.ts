/**
 * Integration tests for the merged outreach flow.
 *
 * Contract under test:
 *   - A single `POST /v1/outreach` produces a Slack notification, an Outreach DB
 *     row, a Peerly job (for p2p), an incremented textCampaignCount, and a
 *     HubSpot trackCampaign call.
 *   - Failures during create (invalid input, Peerly failure, etc.) ALSO fire a
 *     Slack notification — distinct template, no counter increment, no HubSpot.
 *   - Slack delivery itself failing must not change the HTTP response.
 *
 * Out of scope:
 *   - Stripe / promo / payment ordering — separate ticket.
 */

import FormData from 'form-data'
import { useTestService } from '@/test-service'
import { CrmCampaignsService } from '@/campaigns/services/crmCampaigns.service'
import { CampaignTcrComplianceService } from '@/campaigns/tcrCompliance/services/campaignTcrCompliance.service'
import { SlackService } from '@/vendors/slack/services/slack.service'
import { SlackChannel } from '@/vendors/slack/slackService.types'
import { PeerlyP2pJobService } from '@/vendors/peerly/services/peerlyP2pJob.service'
import { GooglePlacesService } from '@/vendors/google/services/google-places.service'
import { AreaCodeFromZipService } from '@/ai/util/areaCodeFromZip.util'
import { FilesService } from '@/files/files.service'
import { Campaign, OutreachType } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mirror the production env gate. Tests don't set OTEL_SERVICE_ENVIRONMENT so
// this resolves to botDev; only the prod deploy resolves to botPolitics.
const EXPECTED_CHANNEL =
  process.env.OTEL_SERVICE_ENVIRONMENT === 'prod'
    ? SlackChannel.botPolitics
    : SlackChannel.botDev

const service = useTestService()

// -- Mocks for I/O boundaries (Slack, Peerly, HubSpot, Google Places, area codes, S3) ---

const slackMessage = vi.fn().mockResolvedValue('ok')
const peerlyCreatePeerlyP2pJob = vi.fn()
const tcrFindFirstOrThrow = vi.fn()
const crmTrackCampaign = vi.fn()
const crmGetCrmCompanyOwnerName = vi.fn().mockResolvedValue('Test PA')
const placesGetAddressByPlaceId = vi.fn().mockResolvedValue({ predictions: [] })
const areaCodeFromZip = vi.fn().mockResolvedValue(['512'])
const filesUploadFile = vi
  .fn()
  .mockResolvedValue('https://test-bucket.s3/fake-image.png')

let campaign: Campaign
let orgSlug: string

beforeEach(async () => {
  // -- Spy on services after the app is booted ------------------------------------------

  const slackSvc = service.app.get(SlackService)
  vi.spyOn(slackSvc, 'message').mockImplementation(slackMessage)

  const peerlySvc = service.app.get(PeerlyP2pJobService)
  vi.spyOn(peerlySvc, 'createPeerlyP2pJob').mockImplementation(
    peerlyCreatePeerlyP2pJob,
  )

  const tcrSvc = service.app.get(CampaignTcrComplianceService)
  vi.spyOn(tcrSvc, 'findFirstOrThrow').mockImplementation(tcrFindFirstOrThrow)

  const crmSvc = service.app.get(CrmCampaignsService)
  vi.spyOn(crmSvc, 'trackCampaign').mockImplementation(crmTrackCampaign)
  vi.spyOn(crmSvc, 'getCrmCompanyOwnerName').mockImplementation(
    crmGetCrmCompanyOwnerName,
  )

  const placesSvc = service.app.get(GooglePlacesService)
  vi.spyOn(placesSvc, 'getAddressByPlaceId').mockImplementation(
    placesGetAddressByPlaceId,
  )

  const areaCodeSvc = service.app.get(AreaCodeFromZipService)
  vi.spyOn(areaCodeSvc, 'getAreaCodeFromZip').mockImplementation(
    areaCodeFromZip,
  )

  const filesSvc = service.app.get(FilesService)
  vi.spyOn(filesSvc, 'uploadFile').mockImplementation(filesUploadFile)

  // -- Default success-shaped mock returns. Override per-test as needed. --------------

  peerlyCreatePeerlyP2pJob.mockResolvedValue('peerly-job-abc-123')
  tcrFindFirstOrThrow.mockResolvedValue({
    id: 'tcr-1',
    campaignId: 999,
    peerlyIdentityId: '11538886',
    status: 'approved',
  })

  // -- DB fixtures: org + campaign --------------------------------------------------

  const campaignId = 999
  orgSlug = `campaign-${campaignId}`

  await service.prisma.organization.create({
    data: { slug: orgSlug, ownerId: service.user.id, positionId: 'pos-1' },
  })

  campaign = await service.prisma.campaign.create({
    data: {
      id: campaignId,
      organizationSlug: orgSlug,
      userId: service.user.id,
      slug: 'jane-doe',
      details: { state: 'TX', zip: '78634' },
      data: { hubspotId: 'hub-1' },
      aiContent: {},
    },
  })
})

// -- Helpers --------------------------------------------------------------------------

const orgHeaders = () => ({ headers: { 'x-organization-slug': orgSlug } })

interface SubmitOpts {
  outreachType: OutreachType
  script?: string
  date?: string
  imageMime?: string
  phoneListId?: number
  voterFileFilterId?: number
  audienceRequest?: string
}

/**
 * Submit an outreach via the API. Today this calls two endpoints; after the refactor
 * it calls one. UPDATE THIS HELPER as part of the refactor — the assertions below
 * stay unchanged.
 */
async function submitOutreach(opts: SubmitOpts) {
  const form = new FormData()
  form.append('campaignId', String(campaign.id))
  form.append('outreachType', opts.outreachType)
  form.append('status', 'pending')
  if (opts.date) form.append('date', opts.date)
  if (opts.script) form.append('script', opts.script)
  if (opts.phoneListId) form.append('phoneListId', String(opts.phoneListId))
  if (opts.voterFileFilterId) {
    form.append('voterFileFilterId', String(opts.voterFileFilterId))
  }
  if (opts.audienceRequest) form.append('audienceRequest', opts.audienceRequest)

  // Required image for p2p / text per controller validation.
  if (
    opts.outreachType === OutreachType.p2p ||
    opts.outreachType === OutreachType.text
  ) {
    form.append('file', Buffer.from('fake-image-bytes'), {
      filename: 'image.png',
      contentType: opts.imageMime ?? 'image/png',
    })
  }

  return service.client.post('/v1/outreach', form, {
    ...orgHeaders(),
    headers: {
      ...orgHeaders().headers,
      ...form.getHeaders(),
    },
  })
}

// -- Outcome assertions ---------------------------------------------------------------

interface SuccessOutcomeOpts {
  outreachType: OutreachType
  expectPeerlyJobLink: boolean
  expectedTextCountAfter: number
}

async function assertSuccessfulOutreach(opts: SuccessOutcomeOpts) {
  // Exactly one Slack message, on the right channel, with the success template.
  expect(slackMessage).toHaveBeenCalledTimes(1)
  const [blocks, channel] = slackMessage.mock.calls[0]
  expect(channel).toBe(EXPECTED_CHANNEL)

  const blob = JSON.stringify(blocks)
  expect(blob).toContain('Campaign Schedule Request')
  if (opts.expectPeerlyJobLink) {
    expect(blob).toContain('peerly.com')
  } else {
    expect(blob).not.toContain('peerly.com')
  }

  // Outreach row committed to DB.
  const outreachRows = await service.prisma.outreach.findMany({
    where: { campaignId: campaign.id },
  })
  expect(outreachRows.length).toBe(1)
  expect(outreachRows[0].outreachType).toBe(opts.outreachType)
  if (opts.outreachType === OutreachType.p2p) {
    expect(outreachRows[0].projectId).toBeTruthy()
  }

  // textCampaignCount incremented.
  const refreshed = await service.prisma.campaign.findUniqueOrThrow({
    where: { id: campaign.id },
  })

  expect(
    (refreshed.data as { textCampaignCount?: number })?.textCampaignCount,
  ).toBe(opts.expectedTextCountAfter)

  // HubSpot synced.
  expect(crmTrackCampaign).toHaveBeenCalledWith(campaign.id)
}

interface FailureOutcomeOpts {
  expectedFailureStepLabel: string
  expectNoOutreachRow: boolean
}

async function assertFailedOutreach(opts: FailureOutcomeOpts) {
  // Exactly one Slack message, on the same channel, with the FAILURE template.
  expect(slackMessage).toHaveBeenCalledTimes(1)
  const [blocks, channel] = slackMessage.mock.calls[0]
  expect(channel).toBe(EXPECTED_CHANNEL)

  const blob = JSON.stringify(blocks)
  expect(blob).toContain('FAILED')
  expect(blob).toContain(opts.expectedFailureStepLabel)

  // No outreach row (or rolled back).
  if (opts.expectNoOutreachRow) {
    const outreachRows = await service.prisma.outreach.findMany({
      where: { campaignId: campaign.id },
    })
    expect(outreachRows.length).toBe(0)
  }

  // Counter unchanged, HubSpot not called.
  const refreshed = await service.prisma.campaign.findUniqueOrThrow({
    where: { id: campaign.id },
  })

  expect(
    (refreshed.data as { textCampaignCount?: number })?.textCampaignCount ?? 0,
  ).toBe(0)
  expect(crmTrackCampaign).not.toHaveBeenCalled()
}

// -- Tests ----------------------------------------------------------------------------

describe('Outreach submission flow — single API call contract', () => {
  describe('success cases', () => {
    it('p2p submission produces 1 success Slack with peerly link, DB row, counter, hubspot', async () => {
      const res = await submitOutreach({
        outreachType: OutreachType.p2p,
        script: 'Vote for me. Reply STOP to opt-out.',
        phoneListId: 3180213,
        date: new Date(Date.now() + 7 * 86400_000).toISOString(),
      })

      expect(res.status).toBe(201)
      await assertSuccessfulOutreach({
        outreachType: OutreachType.p2p,
        expectPeerlyJobLink: true,
        expectedTextCountAfter: 1,
      })
    })

    it('text submission produces 1 success Slack WITHOUT peerly link', async () => {
      const res = await submitOutreach({
        outreachType: OutreachType.text,
        script: 'Vote for me. Reply STOP to opt-out.',
        date: new Date(Date.now() + 7 * 86400_000).toISOString(),
      })

      expect(res.status).toBe(201)
      await assertSuccessfulOutreach({
        outreachType: OutreachType.text,
        expectPeerlyJobLink: false,
        expectedTextCountAfter: 1,
      })
    })

    it('robocall submission produces 1 success Slack WITHOUT peerly link', async () => {
      const res = await submitOutreach({
        outreachType: OutreachType.robocall,
        script: 'Vote for me.',
        date: new Date(Date.now() + 7 * 86400_000).toISOString(),
      })

      expect(res.status).toBe(201)
      await assertSuccessfulOutreach({
        outreachType: OutreachType.robocall,
        expectPeerlyJobLink: false,
        expectedTextCountAfter: 1,
      })
    })
  })

  describe('failure cases — Slack still fires', () => {
    it('invalid image MIME (HEIC) → 400, no DB row, FAILURE Slack with step=validation', async () => {
      const res = await submitOutreach({
        outreachType: OutreachType.p2p,
        script: 'Vote for me. Reply STOP to opt-out.',
        phoneListId: 3180213,
        date: new Date(Date.now() + 7 * 86400_000).toISOString(),
        imageMime: 'image/heic',
      })

      expect(res.status).toBe(400)
      await assertFailedOutreach({
        expectedFailureStepLabel: 'validation',
        expectNoOutreachRow: true,
      })
    })

    it('Peerly job creation throws → 4xx/5xx, no DB row, FAILURE Slack with step=peerlyJobCreation', async () => {
      peerlyCreatePeerlyP2pJob.mockRejectedValueOnce(
        new Error('Peerly API ERROR: account_id required'),
      )

      const res = await submitOutreach({
        outreachType: OutreachType.p2p,
        script: 'Vote for me. Reply STOP to opt-out.',
        phoneListId: 3180213,
        date: new Date(Date.now() + 7 * 86400_000).toISOString(),
      })

      expect([400, 500, 502]).toContain(res.status)
      await assertFailedOutreach({
        expectedFailureStepLabel: 'peerlyJobCreation',
        expectNoOutreachRow: true,
      })
    })

    it('TCR compliance lookup fails → FAILURE Slack with step=tcrLookup', async () => {
      tcrFindFirstOrThrow.mockRejectedValueOnce(
        new Error('TCR record not found'),
      )

      const res = await submitOutreach({
        outreachType: OutreachType.p2p,
        script: 'Vote for me. Reply STOP to opt-out.',
        phoneListId: 3180213,
        date: new Date(Date.now() + 7 * 86400_000).toISOString(),
      })

      expect([400, 500, 502]).toContain(res.status)
      await assertFailedOutreach({
        expectedFailureStepLabel: 'tcrLookup',
        expectNoOutreachRow: true,
      })
    })
  })

  describe('resilience', () => {
    it('Slack webhook itself fails → response is unaffected, server logs error', async () => {
      slackMessage.mockRejectedValueOnce(new Error('slack 5xx'))

      const res = await submitOutreach({
        outreachType: OutreachType.p2p,
        script: 'Vote for me. Reply STOP to opt-out.',
        phoneListId: 3180213,
        date: new Date(Date.now() + 7 * 86400_000).toISOString(),
      })

      // Even though Slack failed, the outreach itself succeeded.
      expect(res.status).toBe(201)

      // The DB row should still be committed.
      const rows = await service.prisma.outreach.findMany({
        where: { campaignId: campaign.id },
      })
      expect(rows.length).toBe(1)
    })
  })
})
