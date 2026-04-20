import { vi } from 'vitest'
import { ClerkUserEnricherService } from '@/vendors/clerk/services/clerk-user-enricher.service'

export const createMockClerkEnricher = (): ClerkUserEnricherService =>
  ({
    enrichUser: vi.fn((user: unknown) => Promise.resolve(user)),
    enrichUsers: vi.fn((users: unknown) => Promise.resolve(users)),
    fetchClerkFields: vi.fn(() => Promise.resolve(null)),
  }) as unknown as ClerkUserEnricherService
