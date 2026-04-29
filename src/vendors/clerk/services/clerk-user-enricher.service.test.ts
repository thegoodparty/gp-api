import { Test } from '@nestjs/testing'
import { LoggerModule } from 'nestjs-pino'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CLERK_CLIENT_PROVIDER_TOKEN } from '@/vendors/clerk/providers/clerk-client.provider'
import { ClerkUserEnricherService } from './clerk-user-enricher.service'

type ClerkUserShape = {
  id: string
  primaryEmailAddress?: { emailAddress: string } | null
  emailAddresses?: { emailAddress: string }[]
  firstName: string | null
  lastName: string | null
  fullName: string | null
  hasImage: boolean
  imageUrl: string
}

const buildClerkUser = (
  overrides: Partial<ClerkUserShape> = {},
): ClerkUserShape => ({
  id: 'clerk_default',
  primaryEmailAddress: { emailAddress: 'clerk@goodparty.org' },
  emailAddresses: [{ emailAddress: 'clerk@goodparty.org' }],
  firstName: 'Clerk',
  lastName: 'User',
  fullName: 'Clerk User',
  hasImage: false,
  imageUrl: '',
  ...overrides,
})

describe('ClerkUserEnricherService', () => {
  let enricher: ClerkUserEnricherService
  let getUser: ReturnType<typeof vi.fn>
  let getUserList: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    getUser = vi.fn()
    getUserList = vi.fn()

    const moduleRef = await Test.createTestingModule({
      imports: [LoggerModule.forRoot({ pinoHttp: { enabled: false } })],
      providers: [
        ClerkUserEnricherService,
        {
          provide: CLERK_CLIENT_PROVIDER_TOKEN,
          useValue: {
            users: { getUser, getUserList },
          },
        },
      ],
    }).compile()

    enricher = moduleRef.get(ClerkUserEnricherService)
  })

  describe('enrichUsers (bulk)', () => {
    it('overwrites DB fields with Clerk values when Clerk has them', async () => {
      getUserList.mockResolvedValue({
        data: [
          buildClerkUser({
            id: 'clerk_a',
            primaryEmailAddress: { emailAddress: 'newer@goodparty.org' },
            firstName: 'Newer',
            lastName: 'Name',
            fullName: 'Newer Name',
          }),
        ],
      })

      const dbUser = {
        id: 1,
        clerkId: 'clerk_a',
        email: 'older@goodparty.org',
        firstName: 'Older',
        lastName: 'Name',
        name: 'Older Name',
        avatar: null,
      }

      const [enriched] = await enricher.enrichUsers([dbUser])

      expect(enriched).toMatchObject({
        email: 'newer@goodparty.org',
        firstName: 'Newer',
        lastName: 'Name',
        name: 'Newer Name',
      })
    })

    it('keeps the DB email when Clerk has no primary email (regression: search with "+" character)', async () => {
      // Simulates a Clerk user that exists but has no primaryEmailAddress and
      // no emailAddresses entry. Previously the enricher overwrote the DB
      // email with '' which then failed `EmailSchema` in
      // ZodResponseInterceptor, returning a 500 to the admin search UI.
      getUserList.mockResolvedValue({
        data: [
          buildClerkUser({
            id: 'clerk_no_email',
            primaryEmailAddress: null,
            emailAddresses: [],
            firstName: 'Matthew',
            lastName: 'Tester',
          }),
        ],
      })

      const dbUser = {
        id: 42,
        clerkId: 'clerk_no_email',
        email: 'matthew+dev-clerk-1@goodparty.org',
        firstName: 'Matthew',
        lastName: 'Tester',
        name: 'Matthew Tester',
        avatar: null,
      }

      const [enriched] = await enricher.enrichUsers([dbUser])

      expect(enriched.email).toBe('matthew+dev-clerk-1@goodparty.org')
    })

    it('keeps DB firstName/lastName/name when Clerk has empty values', async () => {
      getUserList.mockResolvedValue({
        data: [
          buildClerkUser({
            id: 'clerk_blank_names',
            firstName: null,
            lastName: '',
            fullName: null,
          }),
        ],
      })

      const dbUser = {
        id: 7,
        clerkId: 'clerk_blank_names',
        email: 'someone@goodparty.org',
        firstName: 'Real',
        lastName: 'Name',
        name: 'Real Name',
        avatar: null,
      }

      const [enriched] = await enricher.enrichUsers([dbUser])

      expect(enriched).toMatchObject({
        firstName: 'Real',
        lastName: 'Name',
        name: 'Real Name',
      })
    })

    it('falls back to emailAddresses[0] when primary is missing', async () => {
      getUserList.mockResolvedValue({
        data: [
          buildClerkUser({
            id: 'clerk_secondary',
            primaryEmailAddress: null,
            emailAddresses: [{ emailAddress: 'secondary@goodparty.org' }],
          }),
        ],
      })

      const dbUser = {
        id: 8,
        clerkId: 'clerk_secondary',
        email: 'db@goodparty.org',
        firstName: 'X',
        lastName: 'Y',
        name: 'X Y',
        avatar: null,
      }

      const [enriched] = await enricher.enrichUsers([dbUser])

      expect(enriched.email).toBe('secondary@goodparty.org')
    })

    it('returns user untouched when Clerk lookup fails', async () => {
      getUserList.mockRejectedValue(new Error('boom'))

      const dbUser = {
        id: 9,
        clerkId: 'clerk_missing',
        email: 'unchanged@goodparty.org',
        firstName: 'Un',
        lastName: 'Changed',
        name: 'Un Changed',
        avatar: null,
      }

      const [enriched] = await enricher.enrichUsers([dbUser])

      expect(enriched).toEqual(dbUser)
    })
  })

  describe('enrichUser (single)', () => {
    it('keeps DB email when Clerk has no email', async () => {
      getUser.mockResolvedValue(
        buildClerkUser({
          id: 'clerk_single',
          primaryEmailAddress: null,
          emailAddresses: [],
        }),
      )

      const dbUser = {
        id: 100,
        clerkId: 'clerk_single',
        email: 'kept@goodparty.org',
        firstName: 'Kept',
        lastName: 'Email',
        name: 'Kept Email',
        avatar: null,
      }

      const enriched = await enricher.enrichUser(dbUser)

      expect(enriched.email).toBe('kept@goodparty.org')
    })

    it('returns the user unchanged when clerkId is null', async () => {
      const dbUser = {
        id: 200,
        clerkId: null,
        email: 'noclerk@goodparty.org',
        firstName: 'No',
        lastName: 'Clerk',
        name: 'No Clerk',
        avatar: null,
      }

      const enriched = await enricher.enrichUser(dbUser)

      expect(enriched).toEqual(dbUser)
      expect(getUser).not.toHaveBeenCalled()
    })
  })
})
