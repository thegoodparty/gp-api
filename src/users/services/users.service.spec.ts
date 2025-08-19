import { Test, TestingModule } from '@nestjs/testing'
import { UsersService } from './users.service'
import { AnalyticsService } from '../../analytics/analytics.service'
import { CrmUsersService } from './crmUsers.service'
import { PrismaService } from '../../prisma/prisma.service'

jest.mock('../../shared/util/strings.util', () => ({
  trimMany: (o: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(o).map(([k, v]) => [k, (v || '').trim()]),
    ),
}))

jest.mock('../util/passwords.util', () => ({
  hashPassword: jest.fn(async (s: string) => `hashed:${s.trim()}`),
}))

describe('UsersService', () => {
  let service: UsersService
  let prisma: PrismaService
  let crm: CrmUsersService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: AnalyticsService,
          useValue: {},
        },
        {
          provide: CrmUsersService,
          useValue: {
            submitCrmForm: jest.fn().mockResolvedValue(undefined),
            trackUserUpdate: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            user: {
              findMany: jest.fn(),
              create: jest.fn(),
              findFirst: jest.fn(),
              findFirstOrThrow: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
              findUnique: jest.fn(),
              findUniqueOrThrow: jest.fn(),
              count: jest.fn(),
            },
          },
        },
      ],
    }).compile()

    service = module.get(UsersService)
    prisma = module.get(PrismaService)
    crm = module.get(CrmUsersService)
    // @ts-expect-error accessing private
    service._prisma = prisma
    await service.onModuleInit()
  })

  it('creates user with hashed password and crm calls', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(null)
    ;(prisma.user.create as jest.Mock).mockResolvedValueOnce({ id: 1 })

    const user = await service.createUser({
      email: 'test@example.com',
      firstName: ' John ',
      lastName: ' Doe ',
      password: ' pass ',
      allowTexts: true,
      signUpMode: undefined,
    } as unknown as import('src/shared/types/utility.types').WithOptional<
      import('../schemas/CreateUserInput.schema').CreateUserInputDto,
      'password' | 'phone'
    >)

    expect(prisma.user.create).toHaveBeenCalled()
    expect(crm.submitCrmForm).toHaveBeenCalled()
    expect(crm.trackUserUpdate).toHaveBeenCalledWith(1)
    expect(user).toEqual({ id: 1 })
  })

  it('throws conflict on existing user', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ id: 1 })
    await expect(
      service.createUser({
        email: 'a@b.com',
        firstName: 'a',
        lastName: 'b',
      } as unknown as import('src/shared/types/utility.types').WithOptional<
        import('../schemas/CreateUserInput.schema').CreateUserInputDto,
        'password' | 'phone'
      >),
    ).rejects.toThrow('User with this email already exists')
  })
})
