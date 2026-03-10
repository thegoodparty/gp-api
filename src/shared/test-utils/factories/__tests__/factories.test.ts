import { describe, it, expect, beforeEach } from 'vitest'
import { UserRole } from '@prisma/client'
import {
  userFactory,
  campaignFactory,
  createProCampaign,
  createAdminUser,
  createCandidateUser,
  createCampaignManagerUser,
  createCampaignWithUser,
  createProCampaignWithUser,
  createVerifiedCampaign,
  createDemoCampaign,
  createCampaignWithFreeTexts,
  resetUserCounter,
  resetCampaignCounter,
  resetAllCounters,
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

  describe('createCandidateUser', () => {
    it('should create a user with candidate role', () => {
      const candidate = createCandidateUser()

      expect(candidate.roles).toEqual([UserRole.candidate])
    })

    it('should allow overriding candidate user properties', () => {
      const candidate = createCandidateUser({ email: 'candidate@example.com' })

      expect(candidate.roles).toEqual([UserRole.candidate])
      expect(candidate.email).toBe('candidate@example.com')
    })
  })

  describe('createCampaignManagerUser', () => {
    it('should create a user with campaignManager role', () => {
      const manager = createCampaignManagerUser()

      expect(manager.roles).toEqual([UserRole.campaignManager])
    })

    it('should allow overriding campaign manager properties', () => {
      const manager = createCampaignManagerUser({ email: 'mgr@example.com' })

      expect(manager.roles).toEqual([UserRole.campaignManager])
      expect(manager.email).toBe('mgr@example.com')
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

  describe('createVerifiedCampaign', () => {
    it('should create a verified campaign with a verification date', () => {
      const campaign = createVerifiedCampaign()

      expect(campaign.isVerified).toBe(true)
      expect(campaign.dateVerified).toEqual(new Date('2024-01-15T00:00:00Z'))
    })

    it('should allow overriding verified campaign properties', () => {
      const campaign = createVerifiedCampaign({ userId: 7 })

      expect(campaign.isVerified).toBe(true)
      expect(campaign.userId).toBe(7)
    })
  })

  describe('createDemoCampaign', () => {
    it('should create a demo campaign', () => {
      const campaign = createDemoCampaign()

      expect(campaign.isDemo).toBe(true)
    })

    it('should allow overriding demo campaign properties', () => {
      const campaign = createDemoCampaign({ userId: 8 })

      expect(campaign.isDemo).toBe(true)
      expect(campaign.userId).toBe(8)
    })
  })

  describe('createCampaignWithFreeTexts', () => {
    it('should create a campaign with free texts offer', () => {
      const campaign = createCampaignWithFreeTexts()

      expect(campaign.hasFreeTextsOffer).toBe(true)
    })

    it('should allow overriding free texts campaign properties', () => {
      const campaign = createCampaignWithFreeTexts({ userId: 9 })

      expect(campaign.hasFreeTextsOffer).toBe(true)
      expect(campaign.userId).toBe(9)
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

    it('resetAllCounters should reset both counters at once', () => {
      userFactory() // id: 1
      userFactory() // id: 2
      campaignFactory() // id: 1
      campaignFactory() // id: 2

      resetAllCounters()

      expect(userFactory().id).toBe(1)
      expect(campaignFactory().id).toBe(1)
    })
  })

  describe('id override does not advance counter', () => {
    it('user counter should not advance when id is overridden', () => {
      const user = userFactory({ id: 99 })

      expect(user.id).toBe(99)
      // Counter was not consumed, so next auto-id is still 1
      expect(userFactory().id).toBe(1)
    })

    it('user email should be consistent with the overridden id', () => {
      const user = userFactory({ id: 5 })

      // Email should reflect the provided id, not the counter value
      expect(user.email).toBe('testuser5@goodparty.org')
    })

    it('campaign counter should not advance when id is overridden', () => {
      const campaign = campaignFactory({ id: 99 })

      expect(campaign.id).toBe(99)
      // Counter was not consumed, so next auto-id is still 1
      expect(campaignFactory().id).toBe(1)
    })

    it('campaign slug should be consistent with the overridden id', () => {
      const campaign = campaignFactory({ id: 7 })

      // Slug should reflect the provided id, not the counter value
      expect(campaign.slug).toBe('test-campaign-7')
    })
  })

  describe('shallow merge behaviour', () => {
    it('roles array is fully replaced, not merged, when overridden', () => {
      const user = userFactory({ roles: [UserRole.admin, UserRole.candidate] })

      // The entire roles array is replaced, not appended to the default [UserRole.candidate]
      expect(user.roles).toEqual([UserRole.admin, UserRole.candidate])
      expect(user.roles).toHaveLength(2)
    })

    it('completedTaskIds array is fully replaced when overridden', () => {
      const taskId1 = '41b8b290-7e50-4d5a-8c9f-b8e17b253cde'
      const taskId2 = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
      const campaign = campaignFactory({ completedTaskIds: [taskId1, taskId2] })

      expect(campaign.completedTaskIds).toEqual([taskId1, taskId2])
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
