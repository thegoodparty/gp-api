import { beforeEach, describe, expect, it } from 'vitest'
import { ElectionApiMockService } from './electionApiMock.service'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'

describe('ElectionApiMockService', () => {
  let service: ElectionApiMockService

  beforeEach(() => {
    service = new ElectionApiMockService(createMockLogger())
  })

  it('returns the same canned response regardless of campaign id', () => {
    const a = service.getRaceContext(1)
    const b = service.getRaceContext(999999)
    expect(a).toEqual(b)
  })

  it('includes the incumbent in the candidates list', () => {
    const ctx = service.getRaceContext(1)
    const incumbent = ctx.candidates.find((c) => c.isIncumbent === true)
    expect(incumbent).toBeDefined()
    expect(incumbent?.fullName).toBe('Jeffrey Prang')
  })

  it('candidates array length matches candidateCount', () => {
    const ctx = service.getRaceContext(1)
    expect(ctx.candidates).toHaveLength(ctx.candidateCount)
  })

  it('exposes Sandy Sun with a null email to exercise the null path', () => {
    const ctx = service.getRaceContext(1)
    const sandy = ctx.candidates.find((c) => c.fullName === 'Sandy Sun')
    expect(sandy).toBeDefined()
    expect(sandy?.email).toBeNull()
  })
})
