# Observability Platform Vendor Evaluation

## Context

We are evaluating observability vendors to replace New Relic as the "home" of observability at our org. This document compares **Grafana Cloud**, **Datadog**, and **Self-hosted LGTM** across cost, feature parity, and implementation complexity.

### Current Ingest Volume (from New Relic)

| Source         | Avg Daily Ingest | Last 30 Days   | % of Total |
| -------------- | ---------------- | -------------- | ---------- |
| Custom events  | 0.00 GB          | 0.00 GB        | 0.00%      |
| Browser events | 0.76 GB          | 22.68 GB       | 14.20%     |
| Logging        | 0.80 GB          | 24.11 GB       | 15.10%     |
| Metrics        | 1.17 GB          | 35.12 GB       | 22.00%     |
| APM events     | 1.20 GB          | 35.90 GB       | 22.48%     |
| Tracing        | 1.40 GB          | 41.86 GB       | 26.22%     |
| **Total**      | **~5.33 GB**     | **~159.67 GB** | 100%       |

### Team Size

15 developers, all needing seats.

---

## 1. Grafana Cloud

### Pricing Model (Pro Plan — Pay As You Go)

| Item                         | Unit                  | Included Free              | Overage Rate      |
| ---------------------------- | --------------------- | -------------------------- | ----------------- |
| Platform fee                 | flat                  | —                          | $19/month         |
| Logs (Loki)                  | per GB ingested       | 50 GB/month                | $0.50/GB          |
| Metrics (Mimir)              | per 1k active series  | 10k series                 | $6.50/1k series   |
| Traces (Tempo)               | per GB ingested       | 50 GB/month                | $0.50/GB          |
| APM (App Observability)      | per host-hour         | 2,232 hrs/month (~3 hosts) | $0.04/host-hour   |
| RUM (Frontend Observability) | per 1k sessions       | 50k sessions/month         | $0.90/1k sessions |
| Visualization (Grafana)      | per active user/month | —                          | $8/user           |
| IRM (Incident Response)      | per active user/month | 3 users                    | $20/user          |
| AI Assistant                 | per active user/month | 3 users                    | $20/user          |

**Retention**: Metrics 13 months, Logs/Traces 30 days (extendable in 30-day increments at additional cost). Logs can be exported to S3/GCS/Azure Blob for long-term archival at no extra charge.

**Billing notes**:

- Metrics are billed at the 95th percentile of active series count (forgives top 5% of usage, ~36 hrs/month of spikes)
- APM is billed per host-hour, not per GB. Containers are not counted as separate hosts.
- RUM is billed per session (session = user visit, max 4hr lifetime, 15min inactivity timeout)

### Estimated Monthly Cost

| Line Item                 | Calculation                                       | Estimate        |
| ------------------------- | ------------------------------------------------- | --------------- |
| Platform fee              | flat                                              | $19             |
| Visualization             | 15 users × $8                                     | $120            |
| Logs (~24 GB/mo)          | within 50 GB included                             | $0              |
| Metrics                   | ~20k active series est. → 10k billable × $6.50/1k | ~$65            |
| Traces (~42 GB/mo)        | within 50 GB included                             | $0              |
| APM (~5 hosts 24/7)       | 3,600 - 2,232 included = 1,368 hrs × $0.04        | ~$55            |
| RUM (~100k sessions est.) | 50k billable × $0.90/1k                           | ~$45            |
| IRM (5 users)             | 5 - 3 free = 2 × $20                              | $40             |
| **Total**                 |                                                   | **~$344/month** |

> **Caveat**: Metrics cost is the hardest to predict — it depends on active series cardinality, not raw GB. If you have 50k active series instead of 20k, metrics alone jumps to ~$260/month. Grafana provides usage dashboards for precise figures once data flows.

### Features

| Feature                  | Support        | Notes                                                                                                                                                                                                                                                |
| ------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| APM                      | ✅ Full        | Application Observability with service inventory, service maps, RED metrics, root cause analysis workbench                                                                                                                                           |
| Logging                  | ✅ Full        | LogQL query language, full-text search, label filtering, log-to-trace correlation, dashboards, log patterns                                                                                                                                          |
| RUM / Browser Monitoring | ✅ Full        | "Frontend Observability" — Grafana Faro Web SDK, Core Web Vitals, error tracking, session replay                                                                                                                                                     |
| OpenTelemetry            | ✅ First-class | Native OTLP endpoint (gRPC + HTTP), all signal types. Standard OTel SDK/Collector works directly. Grafana Alloy is their OTel Collector distribution but optional.                                                                                   |
| Alerting                 | ✅ Full        | Prometheus-style alerting, multi-datasource, notification policies with routing, Slack/PagerDuty/Teams/webhooks                                                                                                                                      |
| Incident Management      | ✅ Built-in    | Grafana IRM (unified OnCall + Incident). On-call scheduling, escalation chains, Slack/Teams integration, mobile app.                                                                                                                                 |
| Terraform                | ✅ Official    | Grafana Terraform Provider — dashboards, alerts, data sources, stacks, IRM, RBAC                                                                                                                                                                     |
| Pulumi                   | ⚠️ Community   | [pulumiverse/pulumi-grafana](https://github.com/pulumiverse/pulumi-grafana) — bridged Terraform provider, actively maintained (v2.17.0, Nov 2025). Not officially maintained by Grafana Labs.                                                        |
| AI / MCP                 | ✅ Strong      | Grafana Assistant (GA Oct 2025) for query building, dashboard creation, alert explanation. Open-source [MCP server](https://github.com/grafana/mcp-grafana) with PromQL/LogQL querying, dashboard CRUD, alert management, incident management tools. |
| Tracing                  | ✅ Full        | Grafana Tempo, TraceQL query language, trace-to-logs/metrics correlation, service graphs, span metrics                                                                                                                                               |

### Implementation Complexity: Low

- Fully managed SaaS — no infrastructure to provision
- Sign up → get OTLP endpoint → point OTel SDK/Collector → data flows
- Frontend: add Faro Web SDK
- Pre-built dashboards for common integrations
- Grafana Alloy (recommended collector) or standard OTel Collector both work
- Gartner Magic Quadrant 2025 Leader for Observability

---

## 2. Datadog

### Pricing Model (Annual Billing)

| Item                            | Unit                  | Rate (Annual)                     | Rate (On-Demand) |
| ------------------------------- | --------------------- | --------------------------------- | ---------------- |
| Infrastructure Monitoring       | per host/month        | $15 (Pro) / $23 (Enterprise)      | $18 / $27        |
| APM                             | per APM host/month    | $31 (Standard) / $40 (Enterprise) | $36              |
| Log Ingestion                   | per GB                | $0.10                             | $0.10            |
| Log Indexing (30-day retention) | per 1M events         | $2.50                             | $3.75            |
| Custom Metrics                  | per 100 metrics/month | $0.05+ (complex tiered)           | higher           |
| RUM                             | per 1k sessions       | $1.50                             | $2.20            |
| RUM + Session Replay            | per 1k sessions       | $1.80                             | $2.60            |
| On-Call                         | per seat/month        | $20                               | $29              |
| Incident Management             | per seat/month        | $30                               | $43.20           |
| Continuous Profiler             | per host/month        | $19                               | $23              |

**Retention**: Logs default 15 days (configurable). Metrics 15 months. Traces 15 days. Flex Logs "Frozen Tier" allows up to 7 years with in-place search.

**Billing notes**:

- Infrastructure monitoring is the "base" — you must have it for other products
- APM pricing is _per host_, on top of infrastructure pricing
- Custom metrics can explode costs unpredictably (each unique tag combination = separate metric). **All OTel metrics are treated as custom metrics**, which costs significantly more than standard integration metrics — a financial penalty for using OTel over dd-agent.
- Log indexing is the expensive part, not ingestion — $0.10/GB ingestion is cheap, but indexing for search adds up fast
- RUM billing is per session (10k sessions/month = $15/month annual)
- Seats: basic "viewer" access is free, but editor/admin roles are paid per user

### Estimated Monthly Cost

| Line Item               | Calculation                        | Estimate          |
| ----------------------- | ---------------------------------- | ----------------- |
| Infrastructure (Pro)    | 10 hosts × $15                     | $150              |
| APM                     | 10 hosts × $31                     | $310              |
| Log Ingestion           | 24 GB × $0.10                      | $2.40             |
| Log Indexing (30-day)   | ~24M events est. × $2.50/1M        | ~$60              |
| Custom Metrics          | highly variable, est. ~20k metrics | ~$100+            |
| RUM                     | 100k sessions × $1.50/1k           | $150              |
| On-Call (15 seats)      | 15 × $20                           | $300              |
| Incident Mgmt (5 seats) | 5 × $30                            | $150              |
| **Total**               |                                    | **~$1,222/month** |

> **Caveat**: Datadog is notorious for "bill shock." Custom metrics, log indexing, and APM host counts can significantly inflate costs beyond estimates. The $1,222 estimate is conservative — real-world bills are often 2-3x initial estimates. Every product is a separate SKU with its own billing model.

### Features

| Feature                  | Support                        | Notes                                                                                                                                                                                                                                                       |
| ------------------------ | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| APM                      | ✅ Best-in-class               | Deep flame graphs, service maps, error tracking, continuous profiler integration, automatic instrumentation                                                                                                                                                 |
| Logging                  | ✅ Full                        | Log Explorer, log analytics, log patterns, processing pipelines, Flex Logs for long-term retention                                                                                                                                                          |
| RUM / Browser Monitoring | ✅ Full                        | Session replay, error tracking, Core Web Vitals, resource waterfall, user journeys                                                                                                                                                                          |
| OpenTelemetry            | ⚠️ Supported but not preferred | DDOT Collector (Datadog's OTel Collector distro) is the recommended path. Standard OTel works but some features may be limited vs dd-agent. Datadog still pushes its proprietary agent for full feature coverage.                                           |
| Alerting                 | ✅ Full                        | Multi-signal alerting, anomaly detection, forecasting, composite monitors, SLOs                                                                                                                                                                             |
| Incident Management      | ✅ Built-in                    | On-Call (launched 2025) + Incident Management as separate paid products. Paging, escalations, Slack/Teams integration.                                                                                                                                      |
| Terraform                | ✅ Official                    | Datadog Terraform Provider — comprehensive resource coverage                                                                                                                                                                                                |
| Pulumi                   | ✅ Official                    | Official Pulumi Datadog provider in the registry                                                                                                                                                                                                            |
| AI / MCP                 | ✅ Full                        | Bits AI for natural language querying and investigation. Official [MCP server](https://docs.datadoghq.com/bits_ai/mcp_server/) (Preview) with tools for logs, traces, metrics, monitors, incidents, dashboards, RUM. Full REST API for programmatic access. |
| Tracing                  | ✅ Full                        | Distributed tracing with flame graphs, span lists, waterfall views, service maps, profiler integration                                                                                                                                                      |

### Implementation Complexity: Low-Medium

- Fully managed SaaS
- Datadog strongly pushes its own dd-agent for full feature set
- OTel supported via DDOT Collector but not the "happy path" — some features require dd-agent
- Many separate products to enable and configure individually
- Each product is a separate SKU — understanding what you're paying for requires careful attention
- Vendor lock-in risk is moderate: proprietary agent, proprietary query language, data not easily portable

---

## 3. Self-Hosted LGTM (Loki + Grafana + Tempo + Mimir)

### Cost Model

#### Infrastructure Costs (Kubernetes on AWS/GCP)

For your ingest volume (~5.3 GB/day total), you fall well within Loki's "Small" tier (< 100TB/month):

**Loki (Logs) — Small Tier Resources**:

| Component       | CPU | Memory | Replicas | Total CPU  | Total Memory |
| --------------- | --- | ------ | -------- | ---------- | ------------ |
| Ingester        | 2   | 4 GB   | 6        | 12         | 24 GB        |
| Distributor     | 2   | 0.5 GB | 4        | 8          | 2 GB         |
| Index Gateway   | 0.5 | 2 GB   | 4        | 2          | 8 GB         |
| Querier         | 1   | 1 GB   | 10       | 10         | 10 GB        |
| Query Frontend  | 1   | 2 GB   | 2        | 2          | 4 GB         |
| Query Scheduler | 1   | 0.5 GB | 2        | 2          | 1 GB         |
| Compactor       | 2   | 10 GB  | 1        | 2          | 10 GB        |
| **Loki Total**  |     |        |          | **38 CPU** | **59 GB**    |

**Tempo (Traces)** — similar distributed architecture, roughly:

- 1 distributor replica per 10 MB/s, 1 ingester per 3-5 MB/s
- For 1.4 GB/day (~0.016 MB/s): minimal replicas needed, but HA requires at least 2-3 of each
- Estimate: ~10-15 CPU, ~20-40 GB RAM

**Mimir (Metrics)** — similar distributed architecture:

- Estimate for small workload: ~10-15 CPU, ~20-40 GB RAM

**Grafana UI**: ~2 CPU, 4 GB RAM

**OTel Collector / Alloy**: ~2-4 CPU, 4-8 GB RAM

**Total estimated compute**: ~62-74 CPU, ~107-151 GB RAM

**Estimated Infrastructure Cost**:

| Item                                    | Monthly Estimate        |
| --------------------------------------- | ----------------------- |
| Kubernetes cluster (EKS/GKE)            | $75-150 (control plane) |
| Compute (8-12 m6i.xlarge or equivalent) | $800-1,400              |
| S3/GCS storage (~160 GB/month, growing) | $5-10                   |
| Load balancers, networking              | $50-100                 |
| **Infrastructure Total**                | **~$930-$1,660/month**  |

#### Operational Costs

This is the real cost of self-hosting:

- **Dedicated SRE/DevOps time**: Running a distributed LGTM stack requires specialized knowledge in distributed systems, Kubernetes, and each individual component
- **Senior SRE salary**: $150,000-$225,000/year base ($300,000+ fully burdened)
- **Estimated time allocation**: Even part-time maintenance (20-30% of one engineer) = $60,000-$90,000/year = **$5,000-$7,500/month**
- **On-call for the observability stack itself**: Your observability system needs its own monitoring and on-call rotation

#### Licensing

- Grafana, Loki, Tempo, Mimir are all **AGPL-licensed** — free to use, no license costs
- **Unlimited seats** — no per-user charges
- Grafana Enterprise features (SSO/SAML, RBAC, enterprise plugins) require a paid license ($25,000/year minimum)

#### Total Estimated Monthly Cost

| Item                               | Estimate                |
| ---------------------------------- | ----------------------- |
| Infrastructure                     | $930-$1,660             |
| Engineering time (20-30% of 1 SRE) | $5,000-$7,500           |
| Licensing                          | $0 (OSS)                |
| **Total**                          | **$5,930-$9,160/month** |

### Features

| Feature                  | Support        | Notes                                                                                                                                                                                                                                                |
| ------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| APM                      | ❌ No real APM | No "Application Observability" in self-hosted. You get correlated metrics + logs + traces, but no automatic service maps, RED metrics, or root cause analysis. You'd build dashboards manually.                                                      |
| Logging                  | ✅ Full        | LogQL, same as Grafana Cloud. Label-based querying, full-text search.                                                                                                                                                                                |
| RUM / Browser Monitoring | ⚠️ Partial     | Grafana Faro SDK is open-source and can send data to self-hosted Loki/Tempo. But there is no managed "Frontend Observability" product — no automatic session replay, Core Web Vitals dashboards, or error grouping. You'd build everything manually. |
| OpenTelemetry            | ✅ Full        | OTel Collector → Loki/Mimir/Tempo pipeline works natively. Same OTLP support as cloud.                                                                                                                                                               |
| Alerting                 | ✅ Full        | Grafana Alerting works in self-hosted. Same capabilities as cloud.                                                                                                                                                                                   |
| Incident Management      | ⚠️ Degraded    | Grafana OnCall OSS entered maintenance mode (March 2025), will be archived March 2026. No clear self-hosted replacement.                                                                                                                             |
| Terraform                | ✅ Official    | Same Grafana Terraform Provider works for self-hosted instances                                                                                                                                                                                      |
| Pulumi                   | ⚠️ Community   | Same pulumiverse provider, same caveats                                                                                                                                                                                                              |
| AI / MCP                 | ❌ No          | Grafana Assistant is cloud-only. MCP server can connect to self-hosted Grafana for dashboard/query operations, but no AI-powered features.                                                                                                           |
| Tracing                  | ✅ Full        | Tempo works the same self-hosted. TraceQL, service graphs.                                                                                                                                                                                           |

### Cloud-Only Features You'd Miss

These features exist exclusively in Grafana Cloud and have no self-hosted equivalent:

- Application Observability (APM with service maps, RED metrics, root cause analysis)
- Frontend Observability (managed RUM with session replay, error grouping)
- Grafana Assistant (AI)
- Synthetic Monitoring
- Adaptive Telemetry (automatic cost optimization)
- SLO Management (guided UI)
- Knowledge Graph (full-stack service map)
- Kubernetes Monitoring (integrated solution)
- Continuous Profiling (managed Pyroscope)
- Automatic updates and security patches
- 99.5% uptime SLA

### Implementation Complexity: High

- Requires Kubernetes cluster with Helm charts for each component (Loki, Mimir, Tempo, Grafana)
- Each component has its own distributed architecture with multiple microservices
- Object storage (S3/GCS) configuration for each component
- Networking, ingress, TLS, authentication all need manual setup
- Scaling requires understanding each component's bottlenecks
- High availability requires replication configuration per component
- Backup and disaster recovery is your responsibility
- Upgrades are manual and require careful version compatibility checking
- Debugging the observability stack itself is a recursive problem

---

## Comparison Matrix

### Cost Summary

| Vendor               | Est. Monthly Cost  | Cost Predictability                                                             |
| -------------------- | ------------------ | ------------------------------------------------------------------------------- |
| **Grafana Cloud**    | **~$344**          | Medium — metrics cardinality is the wildcard                                    |
| **Datadog**          | **~$1,222**        | Low — many SKUs, custom metrics can explode costs, bill shock is common         |
| **Self-hosted LGTM** | **~$5,930-$9,160** | Medium — infrastructure is predictable, but engineering time is the hidden cost |

### Feature Parity

| Requirement                           | Grafana Cloud  |      Datadog       | Self-hosted LGTM |
| ------------------------------------- | :------------: | :----------------: | :--------------: |
| General APM                           |       ✅       |  ✅ Best-in-class  |        ❌        |
| Logging (slice & dice, dashboards)    |       ✅       |         ✅         |        ✅        |
| Browser Monitoring (RUM)              |       ✅       |         ✅         |    ⚠️ Partial    |
| OpenTelemetry (minimal custom agents) | ✅ First-class | ⚠️ Pushes dd-agent |        ✅        |
| Alerting                              |       ✅       |         ✅         |        ✅        |
| Incident Management                   |       ✅       | ✅ (separate SKUs) |   ⚠️ Degrading   |
| Terraform IaC                         |  ✅ Official   |    ✅ Official     |   ✅ Official    |
| Pulumi IaC                            |  ⚠️ Community  |    ✅ Official     |   ⚠️ Community   |
| AI / MCP                              |   ✅ Strong    |     ✅ Strong      |        ❌        |
| Tracing                               |       ✅       |         ✅         |        ✅        |

### Implementation Complexity

| Vendor               | Complexity | Time to Value |               Maintenance Burden               |
| -------------------- | :--------: | :-----------: | :--------------------------------------------: |
| **Grafana Cloud**    |    Low     |     Days      |                 None (managed)                 |
| **Datadog**          | Low-Medium |     Days      | None (managed), but billing complexity is high |
| **Self-hosted LGTM** |    High    | Weeks-Months  |          Ongoing (dedicated SRE time)          |

---

## Recommendation

**Grafana Cloud is the clear winner for this evaluation.**

### Why Grafana Cloud:

1. **Cost**: At ~$344/month, it's roughly **3.5x cheaper than Datadog** and **17-27x cheaper than self-hosting** (when factoring in engineering time)
2. **OpenTelemetry**: First-class native OTLP support — no proprietary agents required. This directly addresses the "minimal custom agents" requirement and avoids vendor lock-in.
3. **Feature completeness**: Covers all required features (APM, logging, RUM, alerting, incident management, tracing) plus strong bonus features (Terraform IaC, MCP server, AI assistant)
4. **Simplicity**: Fully managed with low implementation complexity
5. **Open standards**: Built on open-source backends (Loki, Mimir, Tempo) — data is portable if you ever need to move
6. **Gartner recognition**: Named a Leader in the 2025 Gartner Magic Quadrant for Observability Platforms

### Why not Datadog:

- **3.5x more expensive** for comparable features, and that's a conservative estimate
- Bill shock is a well-documented industry problem with Datadog
- Pushes proprietary dd-agent over OTel (contradicts our "minimal custom agents" requirement). OTel metrics are treated as "custom metrics" at premium pricing.
- Each product is a separate SKU with its own billing model — administrative complexity
- Stronger vendor lock-in (proprietary query languages, proprietary agent)
- The Pulumi support is better (official provider), but this alone doesn't justify the cost differential

### Why not self-hosted LGTM:

- **17-27x more expensive** than Grafana Cloud when factoring in SRE time
- Missing critical cloud-only features: Application Observability (APM), Frontend Observability (RUM), AI Assistant, Synthetic Monitoring
- High operational complexity — running a distributed LGTM stack is a full-time job
- Grafana OnCall OSS is being archived (March 2026), degrading incident management
- For a 15-person team, the engineering time spent maintaining observability infrastructure is engineering time not spent on product

### Caveats to Monitor:

- **Metrics cardinality**: Grafana Cloud metrics pricing depends on active series count, not raw GB. We should audit our Prometheus/OTel metrics to understand cardinality before committing. Run a free tier first.
- **Pulumi support**: The Grafana Pulumi provider is community-maintained (pulumiverse), not official. If Pulumi IaC is a hard requirement, verify the provider covers the resources you need. Alternatively, the Terraform provider is official and comprehensive.
- **Log retention**: Default is 30 days. If longer retention is needed, either pay for extended retention or use the free log export to S3/GCS.
