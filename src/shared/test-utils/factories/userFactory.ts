import { User, UserRole } from '@prisma/client'
import { generateFactory } from './generate'

let userCounter = 1

export function resetUserCounter() {
  userCounter = 1
}

export const userFactory = generateFactory<User>((args) => {
  // skip incrementing when id is provided so email stays consistent with the given id
  const id = 'id' in args ? (args.id as number) : userCounter++
  return {
    id,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    firstName: 'Test',
    lastName: 'User',
    name: 'Test User',
    email: `testuser${id}@goodparty.org`,
    password: '$2b$10$hashedpassword',
    hasPassword: true,
    phone: '5551234567',
    zip: '90210',
    roles: [UserRole.candidate],
    metaData: {},
    avatar: null,
    passwordResetToken: null,
  }
})

export function createAdminUser(overrides: Partial<User> = {}): User {
  return userFactory({ roles: [UserRole.admin], ...overrides })
}

export function createCandidateUser(overrides: Partial<User> = {}): User {
  return userFactory({ roles: [UserRole.candidate], ...overrides })
}

export function createCampaignManagerUser(overrides: Partial<User> = {}): User {
  return userFactory({ roles: [UserRole.campaignManager], ...overrides })
}
