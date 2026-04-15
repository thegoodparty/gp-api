import { PrismaClient } from '@prisma/client'
import { electedOfficeFactory } from './factories/electedOffice.factory'
import { BallotReadyPositionLevel } from '@goodparty_org/contracts'

export default async function seedOffices(email: string, prisma: PrismaClient) {
  const user = await prisma.user.findUnique({
    where: { email },
  })
  if (!user) {
    throw new Error(`User with email ${email} not found`)
  }

  const campaign = await prisma.campaign.findFirst({
    where: { userId: user.id },
  })
  if (!campaign) {
    throw new Error(`Campaign not found for user with email ${email}`)
  }

  // updating the campaign to match people-api seed data
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      details: {
        zip: '28739',
        filingPeriodsEnd: '2026-07-17',
        filingPeriodsStart: '2026-01-02',
        officeTermLength: '4 years',
        partisanType: 'nonpartisan',
        raceId: 'Z2lkOi8vYmFsbG90LWZhY3RvcnkvUG9zaXRpb25FbGVjdGlvbi8yNzcxNTEz',
        electionId: 'Z2lkOi8vYmFsbG90LWZhY3RvcnkvRWxlY3Rpb24vNTk5NA==',
        wonGeneral: true,
        ballotLevel: BallotReadyPositionLevel.CITY,
        electionDate: '2026-11-03',
        state: 'NC',
        party: 'independent',
        office: 'Other',
        city: 'Hendersonville',
        county: 'Henderson',
        isAiBetaVip: true,
      } satisfies PrismaJson.CampaignDetails,
      didWin: true,
      isDemo: false,
      isActive: true,
      isVerified: true,
    },
  })

  // update pathToVictory data to match the office above

  await prisma.pathToVictory.update({
    where: { campaignId: campaign.id },
    data: {
      data: {
        source: P2VSource.ElectionApi,
        p2vStatus: P2VStatus.complete,
        winNumber: 3142,
        districtId: '17337513-5499-deb9-1cb9-9afc0c3c654e',
        electionType: 'City',
        p2vCompleteDate: '2025-09-25',
        electionLocation: 'HENDERSONVILLE CITY',
        projectedTurnout: 6282,
        voterContactGoal: 15710,
        districtManuallySet: false,
      },
    },
  })

  const eoOrgSlug = `eo-serve-hendersonville`
  await prisma.organization.create({
    data: {
      slug: eoOrgSlug,
      ownerId: user.id,
      customPositionName: 'Hendersonville City Council',
    },
  })

  const electedOffice = electedOfficeFactory({
    userId: user.id,
    campaignId: campaign.id,
    organizationSlug: eoOrgSlug,
  })

  await prisma.organization.upsert({
    where: { slug: electedOffice.organizationSlug },
    update: {},
    create: {
      slug: electedOffice.organizationSlug,
      ownerId: user.id,
    },
  })

  const createdElectedOffice = await prisma.electedOffice.create({
    data: electedOffice,
  })
  console.log('Created elected office')
  return createdElectedOffice
}
