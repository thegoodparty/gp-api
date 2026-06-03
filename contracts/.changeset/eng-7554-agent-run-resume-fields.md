---
'@goodparty_org/contracts': minor
---

Add `AWAITING_RESUME` to the `ExperimentRunStatus` enum
(`ExperimentRunStatusSchema` / `EXPERIMENT_RUN_STATUS_VALUES`) and four fields to
the agent-run read shapes (`AgentRunListItemSchema` / `AgentRunSchema`):
`stage`, `dataQuality`, `resumeScheduledFor`, and `resumeAttempts`. These back
the compliance recovery loop (ENG-7554) — a parked run is now reported as
`AWAITING_RESUME` rather than `COMPLETED`, with its resume schedule and attempt
count surfaced for the gp-admin dashboard.
