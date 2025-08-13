import { Test, TestingModule } from '@nestjs/testing'
import { WebsitesService } from './websites.service'
import { PrismaService } from '../../prisma/prisma.service'

jest.mock('src/users/util/users.util', () => ({
  getUserFullName: (u: { firstName?: string; lastName?: string; name?: string }) =>
    u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim(),
}))

describe('WebsitesService', () => {
  let service: WebsitesService
  let prisma: PrismaService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebsitesService,
        {
          provide: PrismaService,
          useValue: {
            website: { create: jest.fn(), update: jest.fn() },
            domain: { findUniqueOrThrow: jest.fn() },
          },
        },
      ],
    }).compile()

    service = module.get(WebsitesService)
    prisma = module.get(PrismaService)
    // @ts-expect-error private
    service._prisma = prisma
  })

  it('createByCampaign builds content from campaign positions', async () => {
    ;(prisma.website.create as jest.Mock).mockResolvedValueOnce({ id: 10 })
    const result = await service.createByCampaign(
      { email: 'u@e.com', firstName: 'A', lastName: 'B' } as any,
      {
        id: 2,
        slug: 'myslug',
        campaignPositions: [
          { description: 'x', topIssue: { name: 'Issue X' } },
          { description: undefined, topIssue: undefined },
        ],
      } as any,
    )
    expect(prisma.website.create).toHaveBeenCalled()
    expect(result).toEqual({ id: 10 })
  })

  it('findByDomainName returns attached website', async () => {
    ;(prisma.domain.findUniqueOrThrow as jest.Mock).mockResolvedValueOnce({
      website: { id: 7 },
    })
    const site = await service.findByDomainName('example.com')
    expect(site).toEqual({ id: 7 })
  })
})


