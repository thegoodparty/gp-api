import { Test } from '@nestjs/testing'
import { LoggerModule } from 'nestjs-pino'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CLERK_CLIENT_PROVIDER_TOKEN } from '@/vendors/clerk/providers/clerk-client.provider'
import { PrismaService } from '@/prisma/prisma.service'
import { ClerkUserEnricherService } from './clerk-user-enricher.service'

vi.mock('@/vendors/clerk/util/clerkThrottle.util', () => ({
  clerkThrottle: <T>(fn: () => Promise<T>) => fn(),
}))

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
  let userUpdate: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    getUser = vi.fn()
    getUserList = vi.fn()
    userUpdate = vi.fn().mockResolvedValue({})

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
        {
          provide: PrismaService,
          useValue: {
            user: { update: userUpdate },
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
            hasImage: true,
            imageUrl: 'https://img.clerk/new.png',
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
        avatar: 'https://img.clerk/new.png',
      })
    })

    it('keeps the DB email when Clerk has no primary email (regression: search with "+" character)', async () => {
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
        avatar: 'https://legacy/upload.png',
      }

      const [enriched] = await enricher.enrichUsers([dbUser])

      expect(enriched.firstName).toBe('Un')
      expect(enriched.avatar).toBe(null)
    })

    it('strips avatar when user has no clerkId', async () => {
      const dbUser = {
        id: 10,
        clerkId: null as string | null,
        email: 'legacy@goodparty.org',
        firstName: 'Leg',
        lastName: 'acy',
        avatar: 'https://legacy/old.png',
      }

      const [enriched] = await enricher.enrichUsers([dbUser])

      expect(enriched.avatar).toBe(null)
      expect(getUserList).not.toHaveBeenCalled()
    })

    it('sets avatar to null when Clerk has no profile image', async () => {
      getUserList.mockResolvedValue({
        data: [
          buildClerkUser({
            id: 'clerk_no_img',
            hasImage: false,
            imageUrl: '',
          }),
        ],
      })

      const dbUser = {
        id: 11,
        clerkId: 'clerk_no_img',
        email: 'u@goodparty.org',
        firstName: 'U',
        lastName: 'Ser',
        avatar: 'https://cdn/stale-upload.png',
      }

      const [enriched] = await enricher.enrichUsers([dbUser])

      expect(enriched.avatar).toBe(null)
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

    it('returns avatar null when clerkId is null and lazy link finds no Clerk user', async () => {
      getUserList.mockResolvedValue({ data: [] })

      const dbUser = {
        id: 200,
        clerkId: null,
        email: 'noclerk@goodparty.org',
        firstName: 'No',
        lastName: 'Clerk',
        name: 'No Clerk',
        avatar: 'https://legacy/x.png',
      }

      const enriched = await enricher.enrichUser(dbUser)

      expect(enriched).toMatchObject({
        clerkId: null,
        avatar: null,
        firstName: 'No',
      })
      expect(userUpdate).not.toHaveBeenCalled()
    })

    it('lazy-links clerkId by email then applies Clerk avatar', async () => {
      getUserList.mockResolvedValueOnce({
        data: [
          buildClerkUser({
            id: 'user_lazy_1',
            primaryEmailAddress: { emailAddress: 'lazy@goodparty.org' },
            firstName: 'Lazy',
            lastName: 'Linked',
            fullName: 'Lazy Linked',
            hasImage: true,
            imageUrl: 'https://img.clerk/lazy.png',
          }),
        ],
      })

      getUser.mockResolvedValueOnce(
        buildClerkUser({
          id: 'user_lazy_1',
          firstName: 'Lazy',
          lastName: 'Linked',
          fullName: 'Lazy Linked',
          hasImage: true,
          imageUrl: 'https://img.clerk/lazy.png',
        }),
      )

      const dbUser = {
        id: 300,
        clerkId: null,
        email: 'lazy@goodparty.org',
        firstName: 'Old',
        lastName: 'Db',
        name: 'Old Db',
        avatar: 'https://legacy/db.png',
      }

      const enriched = await enricher.enrichUser(dbUser)

      expect(userUpdate).toHaveBeenCalledWith({
        where: { id: 300 },
        data: { clerkId: 'user_lazy_1' },
      })
      expect(enriched).toMatchObject({
        clerkId: 'user_lazy_1',
        firstName: 'Lazy',
        lastName: 'Linked',
        avatar: 'https://img.clerk/lazy.png',
      })
    })

    it('nulls avatar on single-user Clerk fetch failure when clerkId is set', async () => {
      getUser.mockRejectedValue(new Error('clerk down'))

      const dbUser = {
        id: 400,
        clerkId: 'user_err',
        email: 'e@goodparty.org',
        firstName: 'Keep',
        lastName: 'Me',
        avatar: 'https://legacy/z.png',
      }

      const enriched = await enricher.enrichUser(dbUser)

      expect(enriched.firstName).toBe('Keep')
      expect(enriched.avatar).toBe(null)
    })

    it('returns the user unchanged when clerkId is null and no email (no avatar key)', async () => {
      const dbUser = {
        id: 500,
        clerkId: null,
        firstName: 'X',
        lastName: 'Y',
      }

      const enriched = await enricher.enrichUser(dbUser)

      expect(enriched).toEqual(dbUser)
      expect(getUser).not.toHaveBeenCalled()
    })
  })
})
