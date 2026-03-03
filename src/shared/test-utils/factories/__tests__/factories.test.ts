import { describe, it, expect, beforeEach } from 'vitest'
import { UserRole } from '@prisma/client'
import {
  userFactory,
  campaignFactory,
  createProCampaign,
  createAdminUser,
  createCampaignWithUser,
  createProCampaignWithUser,
  resetUserCounter,
  resetCampaignCounter,
} from '../index'

describe('Test Factories', () => {
  beforeEach(() => {
    resetUserCounter()
    resetCampaignCounter()
  })

  describe('userFactory', () => {
    it('should create a user with default values', () => {
      const user = userFactory()

      expect(user).toBeDefined()
      expect(user.id).toBe(1)
      expect(user.email).toBe('testuser1@goodparty.org')
      expect(user.firstName).toBe('Test')
      expect(user.lastName).toBe('User')
      expect(user.roles).toEqual([UserRole.candidate])
    })

    it('should allow overriding default values', () => {
      const user = userFactory({
        email: 'custom@example.com',
        firstName: 'John',
      })

      expect(user.email).toBe('custom@example.com')
      expect(user.firstName).toBe('John')
      expect(user.lastName).toBe('User') // Default value preserved
    })

    it('should increment user IDs', () => {
      const user1 = userFactory()
      const user2 = userFactory()
      const user3 = userFactory()

      expect(user1.id).toBe(1)
      expect(user2.id).toBe(2)
      expect(user3.id).toBe(3)
      expect(user1.email).toBe('testuser1@goodparty.org')
      expect(user2.email).toBe('testuser2@goodparty.org')
      expect(user3.email).toBe('testuser3@goodparty.org')
    })
  })

  describe('createAdminUser', () => {
    it('should create a user with admin role', () => {
      const admin = createAdminUser()

      expect(admin.roles).toEqual([UserRole.admin])
    })

    it('should allow overriding admin user properties', () => {
      const admin = createAdminUser({
        email: 'admin@company.com',
      })

      expect(admin.roles).toEqual([UserRole.admin])
      expect(admin.email).toBe('admin@company.com')
    })
  })

  describe('campaignFactory', () => {
    it('should create a campaign with default values', () => {
      const campaign = campaignFactory()

      expect(campaign).toBeDefined()
      expect(campaign.id).toBe(1)
      expect(campaign.slug).toBe('test-campaign-1')
      expect(campaign.userId).toBe(1)
      expect(campaign.isPro).toBe(false)
      expect(campaign.isActive).toBe(true)
    })

    it('should allow overriding default values', () => {
      const campaign = campaignFactory({
        userId: 42,
        slug: 'custom-slug',
        isPro: true,
      })

      expect(campaign.userId).toBe(42)
      expect(campaign.slug).toBe('custom-slug')
      expect(campaign.isPro).toBe(true)
      expect(campaign.isActive).toBe(true) // Default preserved
    })

    it('should increment campaign IDs', () => {
      const campaign1 = campaignFactory()
      const campaign2 = campaignFactory()
      const campaign3 = campaignFactory()

      expect(campaign1.id).toBe(1)
      expect(campaign2.id).toBe(2)
      expect(campaign3.id).toBe(3)
      expect(campaign1.slug).toBe('test-campaign-1')
      expect(campaign2.slug).toBe('test-campaign-2')
      expect(campaign3.slug).toBe('test-campaign-3')
    })
  })

  describe('createProCampaign', () => {
    it('should create a pro campaign', () => {
      const campaign = createProCampaign()

      expect(campaign.isPro).toBe(true)
      expect(campaign.isVerified).toBe(true)
    })

    it('should allow overriding pro campaign properties', () => {
      const campaign = createProCampaign({
        userId: 99,
        slug: 'pro-campaign',
      })

      expect(campaign.isPro).toBe(true)
      expect(campaign.isVerified).toBe(true)
      expect(campaign.userId).toBe(99)
      expect(campaign.slug).toBe('pro-campaign')
    })
  })

  describe('createCampaignWithUser', () => {
    it('should create a campaign with specified user ID', () => {
      const campaign = createCampaignWithUser(42)

      expect(campaign.userId).toBe(42)
    })

    it('should allow additional overrides', () => {
      const campaign = createCampaignWithUser(42, {
        slug: 'custom-slug',
        isPro: true,
      })

      expect(campaign.userId).toBe(42)
      expect(campaign.slug).toBe('custom-slug')
      expect(campaign.isPro).toBe(true)
    })
  })

  describe('createProCampaignWithUser', () => {
    it('should create a pro campaign with specified user', () => {
      const campaign = createProCampaignWithUser(55)

      expect(campaign.userId).toBe(55)
      expect(campaign.isPro).toBe(true)
      expect(campaign.isVerified).toBe(true)
    })
  })

  describe('Counter reset', () => {
    it('should reset user counter', () => {
      const user1 = userFactory()
      expect(user1.id).toBe(1)

      const user2 = userFactory()
      expect(user2.id).toBe(2)

      resetUserCounter()

      const user3 = userFactory()
      expect(user3.id).toBe(1) // Counter reset
    })

    it('should reset campaign counter', () => {
      const campaign1 = campaignFactory()
      expect(campaign1.id).toBe(1)

      const campaign2 = campaignFactory()
      expect(campaign2.id).toBe(2)

      resetCampaignCounter()

      const campaign3 = campaignFactory()
      expect(campaign3.id).toBe(1) // Counter reset
    })
  })

  describe('Integration - User with Campaign', () => {
    it('should create user and campaign together', () => {
      const user = userFactory({ email: 'candidate@example.com' })
      const campaign = createProCampaignWithUser(user.id)

      expect(user.id).toBe(1)
      expect(campaign.userId).toBe(1)
      expect(campaign.isPro).toBe(true)
    })
  })
})
