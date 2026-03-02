/**
 * Seeds a test user + campaign in the state needed to test P2P phone list upload.
 *
 * Creates:
 *   - A User (candidate role)
 *   - A Campaign with OR/Portland pathToVictory (City_Portland electionType)
 *   - A TcrCompliance record with a peerlyIdentityId
 *
 * The peerlyIdentityId controls whether the Peerly upload call will succeed.
 * Pass a real one from dev to test the full flow, or omit to use a placeholder
 * (the voter query + fixColumns logic will still run; the upload itself will fail).
 *
 * Usage:
 *   npx tsx scripts/seed-peerly-test-campaign.ts [peerlyIdentityId]
 *
 * After running, log in via:
 *   POST /authentication/login
 *   { "email": "peerly-test@goodparty.test", "password": "PeerlyTest1" }
 *
 * Then hit:
 *   POST /p2p/phone-list
 *   Authorization: Bearer <token>
 *   { "name": "Test List" }
 */

import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/users/util/passwords.util'

const prisma = new PrismaClient()

const EMAIL = 'peerly-test@goodparty.test'
const PASSWORD = 'PeerlyTest1'
const SLUG = 'peerly-test-candidate'

async function main() {
  const peerlyIdentityId = process.argv[2] ?? 'placeholder-peerly-id-local'

  console.log('Seeding peerly test campaign...')
  console.log(`  peerlyIdentityId: ${peerlyIdentityId}`)

  const hashedPassword = await hashPassword(PASSWORD)

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { password: hashedPassword },
    create: {
      email: EMAIL,
      firstName: 'Peerly',
      lastName: 'Test',
      name: 'Peerly Test',
      password: hashedPassword,
      hasPassword: true,
      roles: ['candidate'],
    },
  })

  console.log(`  User id: ${user.id} (${user.email})`)

  const campaign = await prisma.campaign.upsert({
    where: { slug: SLUG },
    update: {
      pathToVictory: {
        upsert: {
          create: { data: { electionType: 'City_Portland', electionLocation: 'PORTLAND' } },
          update: { data: { electionType: 'City_Portland', electionLocation: 'PORTLAND' } },
        },
      },
      tcrCompliance: {
        upsert: {
          create: {
            ein: '12-3456789',
            postalAddress: '123 Test St, Portland, OR 97201',
            committeeName: 'Peerly Test Committee',
            websiteDomain: 'peerlytest.goodparty.test',
            filingUrl: 'https://peerlytest.goodparty.test/filing',
            phone: '5035550100',
            email: EMAIL,
            officeLevel: 'local',
            peerlyIdentityId,
          },
          update: { peerlyIdentityId },
        },
      },
    },
    create: {
      slug: SLUG,
      userId: user.id,
      isActive: true,
      details: {
        state: 'OR',
        electionDate: '2026-11-03',
      },
      pathToVictory: {
        create: {
          data: {
            electionType: 'City_Portland',
            electionLocation: 'PORTLAND',
          },
        },
      },
      tcrCompliance: {
        create: {
          ein: '12-3456789',
          postalAddress: '123 Test St, Portland, OR 97201',
          committeeName: 'Peerly Test Committee',
          websiteDomain: 'peerlytest.goodparty.test',
          filingUrl: 'https://peerlytest.goodparty.test/filing',
          phone: '5035550100',
          email: EMAIL,
          officeLevel: 'local',
          peerlyIdentityId,
        },
      },
    },
    include: { tcrCompliance: true },
  })

  console.log(`  Campaign id: ${campaign.id} (slug: ${campaign.slug})`)
  console.log(`  peerlyIdentityId: ${campaign.tcrCompliance?.peerlyIdentityId}`)

  console.log('\nDone. To test:')
  console.log('  1. Get a JWT:')
  console.log(
    `       curl -X POST http://localhost:3000/authentication/login \\`,
  )
  console.log(`         -H 'Content-Type: application/json' \\`)
  console.log(
    `         -d '{"email":"${EMAIL}","password":"${PASSWORD}"}'`,
  )
  console.log('  2. Upload a phone list:')
  console.log(`       curl -X POST http://localhost:3000/p2p/phone-list \\`)
  console.log(`         -H 'Authorization: Bearer <token>' \\`)
  console.log(`         -H 'Content-Type: application/json' \\`)
  console.log(`         -d '{"name":"Test List"}'`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
