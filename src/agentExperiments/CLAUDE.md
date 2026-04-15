# Agent Experiments Module

Dispatches AI agent experiments to the PMF Engine (Fargate), tracks runs, and serves artifacts back to the webapp.

## How It Works

```
webapp POST /request → candidateExperiments.service → agentDispatch.service → SQS dispatch queue
                                                                                    ↓
                                                                            Lambda → Fargate (agent)
                                                                                    ↓
webapp GET /artifact ← candidateExperiments.service ← S3 ← agent uploads artifact
                                                    ← queue consumer updates ExperimentRun status
```

### Request Flow

1. **Webapp** calls `POST /v1/agent-experiments/request` with `{ experimentId }`
2. **Controller** routes to `CandidateExperimentsService.requestExperiment()`
3. **Service** validates AI beta VIP, determines mode (win/serve) from `EXPERIMENT_MODES`
4. **Dispatch method** builds `autoParams` from campaign data, then calls `AgentDispatchService.dispatch()`
5. **AgentDispatchService** creates `ExperimentRun` (PENDING) in DB, sends SQS message to `agent-dispatch-{env}.fifo`
6. **Lambda** (in gp-ai-projects) picks up SQS, launches Fargate task with experiment config
7. **Fargate agent** runs (2-10 min), uploads JSON artifact to S3, sends callback via SQS
8. **Callback Lambda** validates artifact, forwards to `agent-results-{env}.fifo` (gp-api's consumer queue)
9. **Queue consumer** (gp-api) updates ExperimentRun to SUCCESS with `artifactBucket` + `artifactKey`
10. **Webapp** polls `GET /mine` every 5s, sees SUCCESS, fetches artifact via `GET /artifact/:runId`

### Experiment Modes

| Mode | Audience | Gating | Experiments |
|------|----------|--------|-------------|
| `win` | Candidates running for office | `isAiBetaVip` + P2V electionType/Location | voter_targeting, walking_plan |
| `serve` | Elected officials | `isAiBetaVip` + ElectedOffice record | district_intel, peer_city_benchmarking |

### Experiment Dependencies

- `peer_city_benchmarking` depends on `district_intel` — finds the latest SUCCESS district_intel run, fetches artifact from S3, passes trimmed issues (title/summary/status only — full artifact is too large for 8KB ECS env var limit) + artifact key/bucket in params
- When `district_intel` is dispatched, any SUCCESS `peer_city_benchmarking` runs are marked STALE

### Auto-Populated Params

Both dispatch methods build params automatically from campaign data. Caller params override auto-populated values.

**Win**: state, l2DistrictType, l2DistrictName, districtType, districtName, office, party, city, county, zip, topIssues, winNumber, voterContactGoal, projectedTurnout

**Serve**: state, officialName, officeName, city, county, zip, topIssues, l2DistrictType (optional), l2DistrictName (optional), districtType (optional), swornInDate (optional)

**peer_city_benchmarking** (additional): districtIntelRunId, districtIntelArtifactKey, districtIntelArtifactBucket, issues (trimmed)

## Files

| File | Purpose |
|------|---------|
| `agentExperiments.controller.ts` | REST endpoints: dispatch, mine, request, available, artifact |
| `agentExperiments.module.ts` | NestJS module wiring |
| `schemas/agentExperiments.schema.ts` | Zod DTOs: DispatchExperimentDto, RequestExperimentDto |
| `services/candidateExperiments.service.ts` | Main logic: EXPERIMENT_MODES, dispatch routing, artifact retrieval, STALE invalidation |
| `services/agentDispatch.service.ts` | Creates ExperimentRun + sends SQS dispatch message |
| `services/experimentRuns.service.ts` | Prisma CRUD for ExperimentRun (extends createPrismaBase) |

## Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/v1/agent-experiments/dispatch` | POST | admin | Direct dispatch (admin tool) |
| `/v1/agent-experiments/request` | POST | candidate, admin | User-facing: validates campaign, auto-populates params |
| `/v1/agent-experiments/mine` | GET | candidate, admin | List all runs for user's campaign |
| `/v1/agent-experiments/available` | GET | candidate, admin | List experiments for user's mode |
| `/v1/agent-experiments/:runId/artifact` | GET | candidate, admin | Fetch artifact JSON from S3 |

## ExperimentRun Status Flow

```
PENDING → RUNNING → SUCCESS
                  → FAILED
                  → CONTRACT_VIOLATION
SUCCESS → STALE (when dependent experiment is regenerated)
```

## Adding a New Experiment

1. **`schemas/agentExperiments.schema.ts`**: Add experiment ID to `EXPERIMENT_IDS` array — this is the source of truth for the Zod enum. TypeScript will error anywhere the ID set is used exhaustively until all locations are updated.
2. **`services/candidateExperiments.service.ts`**: Add to `EXPERIMENT_MODES` (`'win'` or `'serve'`). The `Record<ExperimentId, ...>` type will force you to add it — won't compile otherwise.
3. **`services/candidateExperiments.service.ts`**: If it needs special params (like peer_city_benchmarking needs district_intel), add logic in the dispatch method. If it has dependencies, add invalidation logic in `requestExperiment()`.
4. **`prisma/schema/experimentRun.prisma`**: Add new enum values if needed + create migration.
5. **`services/candidateExperiments.service.test.ts`**: Add tests for dispatch with auto-populated params, available experiments list, and any dependency/invalidation logic.

## Testing

```bash
npx vitest run src/agentExperiments/
```

## Environment Variables

- `AGENT_DISPATCH_QUEUE_URL` — SQS FIFO queue for dispatch messages
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` — for SQS + S3
