# Segment → HubSpot Integration

This document describes how Segment events flow from the API to HubSpot and trigger workflows that update contact/company fields.

## Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   gp-api    │────▶│   Segment   │────▶│   HubSpot   │────▶│  Workflows  │
│             │     │             │     │   Events    │     │             │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
     Track()         Firehose V2        Custom Event       Update Status
                     Mapping            pe21589597_        on Contact &
                                        segment___         Company
                                        all_track
```

## 10DLC Compliance Flow

The compliance flow tracks user progress through these stages:

1. **Website Created** - User publishes their campaign website
2. **Domain Purchased** - User purchases a custom domain
3. **Registration Submitted** - User submits 10DLC compliance form
4. **Compliance Pending** - User submits PIN verification
5. **Compliant** - Backend confirms registration is approved

## Event → HubSpot Workflow Mappings

| Event Name | HubSpot Workflow | Sets Status To | Fired From |
|-----------|------------------|----------------|------------|
| `Candidate Website - Published` | Ops - Set 10 DLC Compliance Status to Website Published | Website Created | `WebsitesController.updateWebsite()` |
| `Candidate Website - Purchased domain` | Ops - Set 10 DLC Compliance Status to Purchase domain | Domain Purchased | `DomainsService.processDomainRegistration()` |
| `Voter Outreach - 10DLC Compliance Form Submitted` | Ops - Set 10 DLC Compliance Status to Compliance form Submitted | Registration Submitted | `CampaignTcrComplianceController.createTcrCompliance()` |
| `Voter Outreach - 10DLC Compliance PIN Submitted` | Ops - Set 10 DLC Compliance Status to Compliance PIN Submitted | Compliance Pending | `CampaignTcrComplianceController.submitCampaignVerifyPIN()` |
| `Voter Outreach - 10DLC Compliance Completed` | Ops - Set 10 DLC Compliance Status to 10 DLC Compliance Complete | Compliant | `QueueConsumerService.handleTcrComplianceCheckMessage()` |

## Weekly Tasks Digest Flow

A cron job (`WeeklyTasksDigestService`) fires every Sunday at 11 PM Central Time and sends a `WEEKLY_TASKS_DIGEST` message to the SQS queue. The consumer (`WeeklyTasksDigestHandlerService`) processes all campaigns with a future election date and fires a Segment event per campaign with up to 5 upcoming tasks due Monday through Sunday of the coming week.

The event populates the `win_campaign_plan` fields on the HubSpot contact, which a HubSpot workflow uses to send weekly digest emails.

| Event Name | HubSpot Contact Fields | Fired From |
|-----------|----------------------|------------|
| `Campaign Plan - Weekly Tasks Digest` | `plan_tasks_completed`, `plan_total_tasks`, `task_name_1`-`5`, `task_description_1`-`5`, `task_type_1`-`5`, `task_due_date_1`-`5`, `task_week_number_1`-`5` | `WeeklyTasksDigestHandlerService` (via SQS queue) |

Rules:
- Campaigns with a past election date are skipped
- Campaigns with fewer than 3 incomplete tasks are skipped (stale data prevents HubSpot from sending the email)
- Outreach tasks (`text`, `robocall`, `doorKnocking`, `phoneBanking`) are prioritized
- Task due dates are sent as date-only strings (`yyyy-MM-dd`)

Test script: `scripts/test-weekly-tasks-digest-event.ts`

### Manual Recovery (if the cron fails)

The cron enqueues the window in the SQS message itself, so manual triggering just means sending that same message shape by hand. Do this when the Sunday-night cron didn't fire (or the consumer was down) and you want to backfill HubSpot for the current week.

1. Compute the window in UTC:
   - `windowStart` = the Monday you want to cover, at `00:00:00.000Z`
   - `windowEnd` = the following Monday, at `00:00:00.000Z`
   - (Example for the week of April 20, 2026: `2026-04-20T00:00:00.000Z` → `2026-04-27T00:00:00.000Z`)

2. Send this message body to the gp-api FIFO SQS queue (via AWS Console or CLI):
   ```json
   {
     "type": "weeklyTasksDigest",
     "data": {
       "windowStart": "2026-04-20T00:00:00.000Z",
       "windowEnd": "2026-04-27T00:00:00.000Z"
     }
   }
   ```
   - `MessageGroupId`: `gp-queue-weeklyTasksDigest`
   - `MessageDeduplicationId`: anything unique (e.g. `manual-<timestamp>`)

3. The consumer will query all campaigns, fire Segment events, and refresh the HubSpot contact fields. HubSpot's 5-day staleness check applies to whether the digest email sends — a manual recovery within ~5 days of the intended run should still trigger emails.

## Event Definitions

File: `src/vendors/segment/segment.types.ts`

```typescript
EVENTS.CandidateWebsite.Published           // 'Candidate Website - Published'
EVENTS.CandidateWebsite.PurchasedDomain     // 'Candidate Website - Purchased domain'
EVENTS.Outreach.ComplianceFormSubmitted      // 'Voter Outreach - 10DLC Compliance Form Submitted'
EVENTS.Outreach.CompliancePinSubmitted       // 'Voter Outreach - 10DLC Compliance PIN Submitted'
EVENTS.Outreach.ComplianceCompleted          // 'Voter Outreach - 10DLC Compliance Completed'
EVENTS.CampaignPlan.WeeklyTasksDigest       // 'Campaign Plan - Weekly Tasks Digest'
```

## Segment Configuration

### Sources
- **API** - All events from gp-api

### Destination: HubSpot Cloud Mode (Actions)

Key mappings:
- **Firehose Event V2** - Sends all Track events as `pe21589597_segment___all_track` custom events
- The `Name` property contains the event name that workflows match against

## HubSpot Data Flow: Contact → Company

Segment identifies users by email, so events land on the **contact** record first. HubSpot workflows then copy the `10 DLC Compliance Status` from the contact to its associated **company**.

A company can have multiple contacts, but the expectation is a 1:1 relationship between a contact and a company. The `10 DLC Compliance Status` on the **company** is what downstream HubSpot automations (e.g. compliance reminder emails) key off of. The drift report (`scripts/10dlc-status-drift-report.ts`) checks the status on the company record for this reason.

## HubSpot Workflow Configuration

Workflows trigger on:
```
pe21589597_segment___all_track has been completed any number of times
AND Name is equal to any of: [event name]
```

Actions:
1. Set `10 DLC Compliance Status` on the contact
2. Copy `10 DLC Compliance Status` to the associated company
