---
'@goodparty_org/contracts': minor
---

Add agent-runs admin read shapes backing the gp-admin agent-runs dashboard:
`AgentRunListItemSchema` / `AgentRunListItem` (a list row with a candidate
summary derived from `compliance_setup` params), `AgentRunsListQuerySchema` /
`AgentRunsListQuery` (list filters: experimentType, status, organizationSlug,
createdAfter, createdBefore, plus pagination), `AgentRunSchema` / `AgentRun`
(the full `experiment_run` row), and `AgentRunDetailSchema` / `AgentRunDetail`
(`{ run, artifact, conversationLog }`, where `artifact` is an opaque
`Record<string, unknown>` read from S3 and `conversationLog` is plain text).
Also export the `ExperimentRunStatus` enum (`ExperimentRunStatusSchema` /
`EXPERIMENT_RUN_STATUS_VALUES`).
