import { User, UserRole } from '@prisma/client'
import { generateFactory } from './generate'

/**
 * Counter for generating unique user data in tests
 */
let userCounter = 1

/**
 * Reset the user counter (useful for test isolation)
 */
export function resetUserCounter() {
  userCounter = 1
}

/**
 * Factory for creating test User entities
 * Provides predictable defaults suitable for testing
 *
 * @example
 * // Create a basic user
 * const user = userFactory()
 *
 * // Create a user with specific properties
 * const admin = userFactory({ roles: [UserRole.admin], email: 'admin@test.com' })
 */
export const userFactory = generateFactory<User>(() => {
  const id = userCounter++
  return {
    id,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    firstName: 'Test',
    lastName: 'User',
    name: 'Test User',
    email: `testuser${id}@goodparty.org`,
    password: '$2b$10$hashedpassword', // Mock bcrypt hash
    hasPassword: true,
    phone: '5551234567',
    zip: '90210',
    roles: [UserRole.candidate],
    metaData: {},
    avatar: null,
    passwordResetToken: null,
  }
})

/**
 * Create a user with admin role
 */
export function createAdminUser(overrides: Partial<User> = {}): User {
  return userFactory({
    roles: [UserRole.admin],
    ...overrides,
  })
}

/**
 * Create a user with candidate role (default)
 */
export function createCandidateUser(overrides: Partial<User> = {}): User {
  return userFactory({
    roles: [UserRole.candidate],
    ...overrides,
  })
}

/**
 * Create a user with campaign manager role
 */
export function createCampaignManagerUser(overrides: Partial<User> = {}): User {
  return userFactory({
    roles: [UserRole.campaignManager],
    ...overrides,
  })
}
