import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentExperimentsController } from './agentExperiments.controller'
import { AgentDispatchService } from './services/agentDispatch.service'
import { CandidateExperimentsService } from './services/candidateExperiments.service'
import { User, UserRole } from '@prisma/client'

vi.mock('sqs-producer', () => ({
  Producer: { create: () => ({ send: vi.fn() }) },
}))

const testUser = {
  id: 42,
  roles: [UserRole.candidate],
} as unknown as User

describe('AgentExperimentsController', () => {
  let controller: AgentExperimentsController
  let dispatchService: Partial<AgentDispatchService>
  let candidateExperiments: Partial<CandidateExperimentsService>

  beforeEach(() => {
    dispatchService = {
      dispatch: vi.fn().mockResolvedValue({
        runId: 'test-run-id',
        experimentId: 'voter_targeting',
        candidateId: 'candidate-1',
        status: 'dispatched',
      }),
    }
    candidateExperiments = {
      getMyRuns: vi.fn().mockResolvedValue([
        {
          runId: 'run-1',
          experimentId: 'voter_targeting',
          candidateId: '42',
          status: 'SUCCESS',
        },
      ]),
      requestExperiment: vi.fn().mockResolvedValue({
        runId: 'new-run-id',
        experimentId: 'voter_targeting',
        candidateId: '42',
        status: 'dispatched',
      }),
      getArtifact: vi.fn().mockResolvedValue({ result: 'data' }),
    }
    controller = new AgentExperimentsController(
      dispatchService as AgentDispatchService,
      candidateExperiments as CandidateExperimentsService,
    )
  })

  it('dispatches an experiment and returns the result', async () => {
    const result = await controller.dispatch({
      experimentId: 'voter_targeting',
      candidateId: 'candidate-1',
      params: { foo: 'bar' },
    })

    expect(dispatchService.dispatch).toHaveBeenCalledWith({
      experimentId: 'voter_targeting',
      candidateId: 'candidate-1',
      params: { foo: 'bar' },
    })

    expect(result).toEqual({
      runId: 'test-run-id',
      experimentId: 'voter_targeting',
      candidateId: 'candidate-1',
      status: 'dispatched',
    })
  })

  it('returns experiment runs for the current user', async () => {
    const result = await controller.getMyRuns(testUser)

    expect(candidateExperiments.getMyRuns).toHaveBeenCalledWith(testUser)
    expect(result).toEqual([
      {
        runId: 'run-1',
        experimentId: 'voter_targeting',
        candidateId: '42',
        status: 'SUCCESS',
      },
    ])
  })

  it('requests an experiment for the current user', async () => {
    const body = { experimentId: 'voter_targeting', params: { key: 'val' } }
    const result = await controller.requestExperiment(testUser, body)

    expect(candidateExperiments.requestExperiment).toHaveBeenCalledWith(
      testUser,
      body,
    )
    expect(result).toEqual({
      runId: 'new-run-id',
      experimentId: 'voter_targeting',
      candidateId: '42',
      status: 'dispatched',
    })
  })

  it('returns artifact JSON for a run', async () => {
    const result = await controller.getArtifact(testUser, 'run-abc')

    expect(candidateExperiments.getArtifact).toHaveBeenCalledWith(
      testUser,
      'run-abc',
    )
    expect(result).toEqual({ result: 'data' })
  })
})
