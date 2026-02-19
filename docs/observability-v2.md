# Observability Platform Vendor Evaluation (v2)

## Context

We are evaluating observability vendors to replace New Relic as our "home" of observability. This document compares **Grafana Cloud**, **Datadog**, **Grafana Cloud + Sentry**, and **Self-hosted LGTM** across cost, feature parity, and implementation complexity.

### Current Ingest Volume (from New Relic)

| Source         | Avg Daily    | Last 30 Days   | % of Total |
| -------------- | ------------ | -------------- | ---------- |
| Browser events | 0.76 GB      | 22.68 GB       | 14.20%     |
| Logging        | 0.80 GB      | 24.11 GB       | 15.10%     |
| Metrics        | 1.17 GB      | 35.12 GB       | 22.00%     |
| APM events     | 1.20 GB      | 35.90 GB       | 22.48%     |
| Tracing        | 1.40 GB      | 41.86 GB       | 26.22%     |
| **Total**      | **~5.33 GB** | **~159.67 GB** | 100%       |

**Team size**: 15 developers, most desiring seats.

---

## 1. Grafana Cloud

### Pricing Model (Pro Plan — Pay As You Go)

| Item                         | Included Free       | Overage Rate      |
| ---------------------------- | ------------------- | ----------------- |
| Platform fee                 | —                   | $19/month         |
| Logs (Loki)                  | 50 GB/month         | $0.50/GB          |
| Traces (Tempo)               | 50 GB/month         | $0.50/GB          |
| Profiles (Pyroscope)         | 50 GB/month         | $0.50/GB          |
| Metrics (Mimir)              | 10k series          | $6.50/1k series   |
| RUM (Frontend Observability) | 100k sessions/month | $0.90/1k sessions |
| Visualization (Grafana)      | 3 users             | $8/user           |

**Retention**: Metrics 13 months, Logs/Traces 30 days (extendable at additional cost). Logs can be exported to S3/GCS for long-term archival at no extra charge.

**Billing notes**:

- Metrics are billed at the 95th percentile of active series count (forgives top 5% of spikes, ~36 hrs/month)
- RUM is billed per session (max 4hr lifetime, 15min inactivity timeout)

### Estimated Monthly Cost

Assumptions: 75k active metric series, logs/traces/profiles volume doubles from current NR levels (buffer for growth), 200k monthly frontend sessions.

| Line Item                   | Calculation                                     | Estimate                       |
| --------------------------- | ----------------------------------------------- | ------------------------------ |
| Platform fee                | flat                                            | $19.00                         |
| Visualization               | 15 users − 3 included = 12 × $8                 | $96.00                         |
| Metrics                     | 75k − 10k included = 65k billable × $6.50/1k    | $422.50                        |
| Logs (~48 GB/mo, doubled)   | under 50 GB included                            | $0.00                          |
| Traces (~84 GB/mo, doubled) | 84 − 50 included = 34 GB overage × $0.50        | $16.86                         |
| Profiles                    | minimal, under 50 GB included                   | $0.00                          |
| Frontend (200k sessions)    | 200k − 100k included = 100k billable × $0.90/1k | $90.00                         |
| **Total**                   |                                                 | **~$644/month (~$7,732/year)** |

> **Future add — IRM**: Our most likely future expansion is Grafana IRM (Incident Response & Management) for on-call scheduling, escalation chains, and Slack integration. Cost: 3 users included free, then $20/user/month. For 15 users: 12 billable × $20 = **$240/month ($2,880/year)**, bringing the total to ~$884/month (~$10,612/year).

> **Metrics cardinality is the wildcard**: Metrics pricing depends on active series count, not raw GB. 75k is our working assumption — Grafana provides usage dashboards for precise figures once data flows. At 50k series the metrics line drops to ~$260; at 100k it rises to ~$585.

### Features

| Feature             | Support        | Notes                                                                                |
| ------------------- | -------------- | ------------------------------------------------------------------------------------ |
| APM                 | ✅ Full        | Service inventory, service maps, RED metrics, root cause analysis                    |
| Logging             | ✅ Full        | LogQL, full-text search, log-to-trace correlation, dashboards                        |
| RUM                 | ✅ Full        | Faro Web SDK, Core Web Vitals, error tracking, session replay                        |
| OpenTelemetry       | ✅ First-class | Native OTLP endpoint (gRPC + HTTP). Standard OTel SDK/Collector works directly.      |
| Alerting            | ✅ Full        | Prometheus-style, multi-datasource, Slack/PagerDuty/Teams/webhooks                   |
| Incident Management | ✅ Built-in    | Grafana IRM — on-call, escalations, Slack/Teams, mobile app (paid add-on, see above) |
| Terraform           | ✅ Official    | Grafana Terraform Provider — dashboards, alerts, data sources, IRM, RBAC             |
| Pulumi              | ⚠️ Community   | pulumiverse/pulumi-grafana — bridged Terraform provider, actively maintained         |
| AI / MCP            | ✅ Strong      | Grafana Assistant for query building, dashboard creation. Open-source MCP server.    |
| Tracing             | ✅ Full        | Tempo, TraceQL, trace-to-logs/metrics correlation, service graphs                    |

### Implementation Complexity: Low

Fully managed SaaS. Sign up → get OTLP endpoint → point OTel SDK → data flows. Pre-built dashboards, Grafana Alloy or standard OTel Collector both work. Gartner 2025 Leader for Observability.

---

## 2. Datadog

### Pricing Model (Annual Billing)

| Item                            | Rate (Annual)                                 |
| ------------------------------- | --------------------------------------------- |
| Infrastructure Monitoring       | $15 (Pro) / $23 (Enterprise) per host/mo      |
| APM                             | $31 (Standard) / $40 (Enterprise) per host/mo |
| Log Ingestion                   | $0.10/GB                                      |
| Log Indexing (30-day retention) | $2.50 per 1M events                           |
| Custom Metrics                  | $5 per 100 metrics/mo (tiered)                |
| RUM                             | $1.50 per 1k sessions                         |
| On-Call                         | $20/seat/mo                                   |
| Incident Management             | $30/seat/mo                                   |

**Key billing gotchas**:

- Infrastructure monitoring is the "base" — required for other products
- APM is billed _per host, on top of_ infrastructure pricing
- **All OTel metrics are treated as custom metrics**, which cost significantly more than standard integration metrics. This is a financial penalty for using OTel over dd-agent and creates vendor lock-in by design.
- Custom metrics can explode costs unpredictably — each unique tag combination = separate metric. A single high-cardinality tag (like `userId` or `endpoint`) can multiply your series count by orders of magnitude.
- Log _indexing_ is the expensive part, not ingestion

### Estimated Cost & Sales Reality

At list prices, a conservative estimate for our footprint (10 hosts, 15 devs, logs + APM + RUM — excluding incident management) lands around **~$750-$800/month ($9,000-$9,600/year)**.

> **Future add — Incident Management**: Datadog sells On-Call ($20/seat/mo) and Incident Management ($30/seat/mo) as separate SKUs. For 15 on-call users + 5 incident management seats: **~$450/month ($5,400/year)**, bringing the total to ~$1,200-$1,250/month. This is notably more expensive than Grafana's unified IRM at $240/month for the same team size.

However, we have intel from a contact inside Datadog:

> A sales rep would likely work to meet a ~$15k/year budget for a year-1 deal, but year 2 onward would expect **10-20% annual increases** until they reached their actual target price.

This pattern is well-documented across the industry. Datadog sales is incentivized to land new logos aggressively, then relies on switching costs (dashboards, alert configs, team familiarity) to retain at higher prices at renewal. Key dynamics:

- **Year 1**: 15-20% discount off list is achievable with an annual commitment. ~$9-10k base (without incident management) is plausible for year 1 with tight usage control.
- **Year 2+**: Committed volumes can only be _increased_, never decreased during the contract. Natural usage growth (more hosts, more logs, more metrics) compounds with reduced discounts.
- **Bill shock is real**: Industry surveys show a consistent 3-4x multiplier between what companies _expect_ to pay and what they _actually_ pay for Datadog. Custom metrics and log indexing are the most common culprits.

**Projected annual cost trajectory:**

| Year | Optimistic | Realistic | Pessimistic |
| ---- | ---------- | --------- | ----------- |
| 1    | ~$8k       | ~$10k     | ~$14k       |
| 2    | ~$10k      | ~$13k     | ~$20k       |
| 3    | ~$12k      | ~$17k     | ~$28k       |

_Excludes incident management. Add ~$5.4k/year for On-Call + Incident Management at list price._

### Features

| Feature             | Support                     | Notes                                                                                        |
| ------------------- | --------------------------- | -------------------------------------------------------------------------------------------- |
| APM                 | ✅ Best-in-class            | Deep flame graphs, automatic instrumentation, profiler                                       |
| Logging             | ✅ Full                     | Log Explorer, analytics, Flex Logs for long-term                                             |
| RUM                 | ✅ Full                     | Session replay, Core Web Vitals, user journeys                                               |
| OpenTelemetry       | ⚠️ Supported, not preferred | OTel works but DD pushes proprietary agent. OTel metrics = custom metrics = premium pricing. |
| Alerting            | ✅ Full                     | Anomaly detection, forecasting, SLOs                                                         |
| Incident Management | ✅ Built-in                 | On-Call + Incident Management as separate paid SKUs                                          |
| Terraform           | ✅ Official                 | Comprehensive resource coverage                                                              |
| Pulumi              | ✅ Official                 | Official Pulumi provider                                                                     |
| AI / MCP            | ✅ Full                     | Bits AI, official MCP server (Preview)                                                       |
| Tracing             | ✅ Full                     | Flame graphs, span lists, service maps                                                       |

### Implementation Complexity: Low-Medium

Fully managed SaaS. Datadog pushes its own dd-agent for full feature set — OTel is supported but not the "happy path." Each product is a separate SKU to enable and configure. Moderate vendor lock-in risk (proprietary agent, proprietary query language, data not easily portable).

---

## 3. Grafana Cloud + Sentry (Recommended)

This option uses **Grafana Cloud as the primary observability platform** (metrics, logs, traces, dashboards, alerting) and adds **Sentry exclusively for frontend observability** — specifically its best-in-class error tracking and session replay in the browser. We would _not_ use Sentry for backend instrumentation (no Node.js SDK, no server-side APM, no logs, no tracing). All backend observability stays in Grafana.

### Why This Combination?

Sentry can't replace a full observability platform (no metrics, no infrastructure monitoring, minimal incident management), but it excels at two things better than anyone else:

- **Error tracking**: Automatic error grouping, stack traces with source context, issue assignment and triage workflows
- **Session Replay**: Video-like replay of user sessions that triggered errors, with DOM snapshots and network waterfall. This is a critical fallback debugging tool — when logs, traces, and metrics don't tell the full story, replaying the user's session often does.

These complement Grafana Cloud's strengths rather than overlapping with them.

### Sentry Pricing (Team Plan)

Sentry's Team plan has **unlimited seats** (no per-user charge) and charges by event volume:

| Item               | Included  | Overage (Reserved)                       |
| ------------------ | --------- | ---------------------------------------- |
| Base plan          | —         | $29/month                                |
| Errors             | 50k/month | ~$0.00029/error (decreasing with volume) |
| Session Replays    | 50/month  | ~$0.003/replay                           |
| Seer AI (optional) | —         | $40/active contributor/month             |

### Estimated Combined Monthly Cost

**Grafana Cloud** (same as Section 1): **~$644/month**

**Sentry** (companion, Team plan):

| Component              | Calculation             | Estimate       |
| ---------------------- | ----------------------- | -------------- |
| Base plan              | flat                    | $29            |
| Errors (~200k/mo est.) | 150k overage × $0.00029 | ~$44           |
| Replays (~5k/mo)       | 4,950 overage × $0.003  | ~$15           |
| **Sentry subtotal**    |                         | **~$88/month** |

|                            | Monthly   | Annual      |
| -------------------------- | --------- | ----------- |
| **Grafana Cloud + Sentry** | **~$732** | **~$8,784** |

> **Seer AI**: Sentry's AI debugging agent costs $40/active contributor/month. For 15 devs that's $600/month — a significant add. Worth evaluating with their free trial before committing. If only 5 devs actively use it, that's $200/month.

> **Future add — IRM**: Same as standalone Grafana — adding IRM for 15 users would add ~$240/month, bringing the combined total to ~$972/month (~$11,664/year).

### What This Gives You Over Grafana Alone

- Superior error triage workflows (Sentry's core strength)
- Session replay with full DOM snapshots tied to errors
- Seer AI for automated root cause analysis and fix suggestions
- Unlimited seats at no additional cost
- Sentry's MCP server for AI-powered debugging in your IDE

### What We'd Use (and Not Use) in Sentry

Sentry is scoped to **frontend only**: the `@sentry/browser` SDK for error tracking and session replay in the browser. We would _not_ install `@sentry/node` or `@sentry/nestjs`, send logs to Sentry, use Sentry for tracing, or use Sentry's performance monitoring. All backend and infrastructure observability stays in Grafana Cloud.

---

## 4. Self-Hosted LGTM (Loki + Grafana + Tempo + Mimir)

### Cost Model

For our ingest volume (~5.3 GB/day), the infrastructure itself is modest — the real cost is engineering time.

**Infrastructure**: Running the full LGTM stack in Kubernetes requires ~62-74 CPU and ~107-151 GB RAM across all components (Loki ingesters/distributors/queriers, Tempo, Mimir, Grafana UI, OTel Collector). On AWS/GCP this translates to 8-12 mid-size instances.

| Item                                    | Monthly Estimate        |
| --------------------------------------- | ----------------------- |
| Kubernetes cluster (EKS/GKE)            | $75-150 (control plane) |
| Compute (8-12 m6i.xlarge or equivalent) | $800-1,400              |
| S3/GCS storage (~160 GB/month, growing) | $5-10                   |
| Load balancers, networking              | $50-100                 |
| **Infrastructure Total**                | **~$930-$1,660/month**  |

**Engineering time**: Even part-time maintenance (20-30% of one SRE) costs $5,000-$7,500/month fully burdened. The observability stack needs its own monitoring, on-call rotation, upgrades, and capacity planning.

**Licensing**: Grafana, Loki, Tempo, Mimir are AGPL-licensed — free, unlimited seats. Enterprise features (SSO/SAML, RBAC) require a paid license ($25k/year minimum).

| Item                               | Estimate                                   |
| ---------------------------------- | ------------------------------------------ |
| Infrastructure                     | $930-$1,660                                |
| Engineering time (20-30% of 1 SRE) | $5,000-$7,500                              |
| Licensing                          | $0 (OSS)                                   |
| **Total**                          | **$5,930-$9,160/month (~$71k-$110k/year)** |

### Features

| Feature             | Support        | Notes                                                                                         |
| ------------------- | -------------- | --------------------------------------------------------------------------------------------- |
| APM                 | ❌ No real APM | No service maps, RED metrics, or root cause analysis. Build dashboards manually.              |
| Logging             | ✅ Full        | LogQL, same as Grafana Cloud                                                                  |
| RUM                 | ⚠️ Partial     | Faro SDK is OSS, but no managed session replay, Core Web Vitals dashboards, or error grouping |
| OpenTelemetry       | ✅ Full        | Same OTLP support as cloud                                                                    |
| Alerting            | ✅ Full        | Grafana Alerting works in self-hosted                                                         |
| Incident Management | ⚠️ Degrading   | OnCall OSS entered maintenance mode (Mar 2025), archived Mar 2026                             |
| Terraform           | ✅ Official    | Same Grafana Terraform Provider                                                               |
| Pulumi              | ⚠️ Community   | Same pulumiverse provider                                                                     |
| AI / MCP            | ❌ No          | Grafana Assistant is cloud-only. MCP server works for dashboard/query ops, no AI features.    |
| Tracing             | ✅ Full        | Tempo, TraceQL, service graphs                                                                |

### Cloud-Only Features You'd Miss

Application Observability (APM), Frontend Observability (managed RUM), Grafana Assistant (AI), Synthetic Monitoring, Adaptive Telemetry, SLO Management, Knowledge Graph, Kubernetes Monitoring, Continuous Profiling, automatic updates, and 99.5% uptime SLA.

### Implementation Complexity: High

Requires Kubernetes with Helm charts per component, object storage config, networking/TLS/auth, manual scaling, HA replication, backup/DR — and debugging the observability stack itself is a recursive problem.

---

## Comparison Matrix

### Cost Summary

_All estimates exclude incident management — see per-vendor sections for add-on costs._

| Option                    | Est. Monthly  | Est. Annual | Cost Trajectory                                              |
| ------------------------- | ------------- | ----------- | ------------------------------------------------------------ |
| **Grafana Cloud**         | ~$644         | ~$7,732     | Predictable — scales with usage                              |
| **Grafana + Sentry**      | ~$732         | ~$8,784     | Predictable — Sentry adds ~$88/mo                            |
| **Datadog** (Year 1 deal) | ~$750-800     | ~$9-10k     | Risky — expect 10-20% annual increases, bill shock potential |
| **Datadog** (Year 3 est.) | ~$1,000-1,700 | ~$12-20k    | Growing — compounding usage + reduced discounts              |
| **Self-hosted LGTM**      | ~$5,930-9,160 | ~$71-110k   | Stable infra cost, but engineering time dominates            |

**Incident management add-on costs**: Grafana IRM ~$240/mo ($2,880/yr) · Datadog On-Call + Incident Mgmt ~$450/mo ($5,400/yr) · Self-hosted: degrading (OnCall OSS archived Mar 2026)

### Feature Parity

| Requirement              |  Grafana Cloud   |  Grafana + Sentry   |      Datadog       | Self-hosted LGTM |
| ------------------------ | :--------------: | :-----------------: | :----------------: | :--------------: |
| APM                      |        ✅        |         ✅          |  ✅ Best-in-class  |        ❌        |
| Logging                  |        ✅        |         ✅          |         ✅         |        ✅        |
| RUM / Browser Monitoring |        ✅        | ✅ + Session Replay |         ✅         |    ⚠️ Partial    |
| Error Tracking / Triage  |     ✅ Basic     |  ✅ Best-in-class   |         ✅         |        ❌        |
| OpenTelemetry            |  ✅ First-class  |   ✅ First-class    | ⚠️ Pushes dd-agent |        ✅        |
| Alerting                 |        ✅        |         ✅          |         ✅         |        ✅        |
| Incident Management      | ✅ (paid add-on) |  ✅ (paid add-on)   |  ✅ (paid add-on)  |   ⚠️ Degrading   |
| Terraform                |   ✅ Official    |  ✅ Both official   |    ✅ Official     |   ✅ Official    |
| AI / MCP                 |    ✅ Strong     |  ✅ Strong (both)   |     ✅ Strong      |        ❌        |
| Tracing                  |        ✅        |         ✅          |         ✅         |        ✅        |

---

## Recommendation

**Grafana Cloud + Sentry is the recommended stack** — Grafana Cloud as the primary observability platform, with Sentry providing best-in-class error tracking and session replay as a fallback debugging tool.

### Why Grafana Cloud + Sentry

1. **Cost**: ~$8,784/year combined — still well under a negotiated Datadog year-1 deal, and the gap only widens over time
2. **Session replay as a debugging fallback**: When logs, traces, and metrics don't tell the full story, replaying the exact user session often does. This is a key capability gap in Grafana Cloud alone.
3. **OpenTelemetry**: Grafana has first-class native OTLP support, no proprietary agents, no financial penalty for using open standards
4. **Feature completeness**: Together they cover all required signals (APM, logs, RUM, metrics, traces, alerting, error triage, session replay) with IRM available as a future add-on
5. **Predictable pricing**: Both are usage-based with generous free tiers. No "bill shock" pattern. Metrics cardinality is the one variable to watch.
6. **Low lock-in**: Grafana is built on open-source backends (Loki, Mimir, Tempo) — data is portable. Sentry adds ~$1k/year and can be dropped if Grafana ships native session replay.

> **Watch: Grafana native session replay is in development.** There's an [open feature request](https://github.com/grafana/faro-web-sdk/issues/989) and a draft PR integrating rrweb into the Faro SDK. No timeline yet, but if/when this ships, we can reevaluate whether Sentry is still worth the extra ~$1k/year.

### Why Not Datadog

- **~$2k more per year** in year 1 on base cost alone, but the gap widens significantly by year 3 due to annual price increases and usage growth. Adding incident management to both widens the gap further (Datadog's is ~2x the cost of Grafana IRM).
- Insider confirmation: sales will negotiate year-1 pricing, but plan for 10-20% annual increases
- **OTel penalty**: All OpenTelemetry metrics are billed as custom metrics at premium rates — a financial incentive to use proprietary dd-agent, creating lock-in
- Bill shock is an industry-wide known pattern with Datadog
- Each product is a separate SKU — administrative and billing complexity

### Why Not Self-Hosted LGTM

- **10-14x more expensive** than Grafana Cloud when factoring in SRE time (~$71-110k/year vs ~$7.7k/year)
- Missing critical cloud-only features: APM, managed RUM, AI Assistant, Synthetic Monitoring
- Grafana OnCall OSS is being archived (March 2026), leaving no self-hosted incident management path
- For a 15-person team, the engineering time spent maintaining observability infrastructure is time not spent on product

### Next Steps

1. Start a Grafana Cloud free tier to validate metrics cardinality (our biggest cost unknown)
2. Set up Sentry Team plan for error tracking and session replay
3. Plan OTel SDK instrumentation for backend + Faro SDK for frontend
