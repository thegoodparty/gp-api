import { TestInfo } from '@playwright/test'
import { TestUser } from './auth.util'

export interface TestContext {
  testUser?: TestUser
  testUserEmail?: string
  adminToken?: string
}

export interface TestInfoWithContext extends TestInfo {
  testContext?: TestContext
}
