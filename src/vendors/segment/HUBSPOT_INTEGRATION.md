# Segment → HubSpot Integration

This document describes how Segment events flow from the API to HubSpot and trigger workflows that update user compliance status.

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

## Event Definitions

File: `src/vendors/segment/segment.types.ts`

```typescript
EVENTS.CandidateWebsite.Published           // 'Candidate Website - Published'
EVENTS.CandidateWebsite.PurchasedDomain     // 'Candidate Website - Purchased domain'
EVENTS.Outreach.ComplianceFormSubmitted      // 'Voter Outreach - 10DLC Compliance Form Submitted'
EVENTS.Outreach.CompliancePinSubmitted       // 'Voter Outreach - 10DLC Compliance PIN Submitted'
EVENTS.Outreach.ComplianceCompleted          // 'Voter Outreach - 10DLC Compliance Completed'
```

## Segment Configuration

### Sources
- **API** - All events from gp-api

### Destination: HubSpot Cloud Mode (Actions)

Key mappings:
- **Firehose Event V2** - Sends all Track events as `pe21589597_segment___all_track` custom events
- The `Name` property contains the event name that workflows match against

## HubSpot Workflow Configuration

Workflows trigger on:
```
pe21589597_segment___all_track has been completed any number of times
AND Name is equal to any of: [event name]
```

Actions:
1. Set `10 DLC Compliance Status` on associated companies
2. Set `10 DLC Compliance Status` on contact
