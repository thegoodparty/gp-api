# Plan to Revamp NestJS Deployment: Architecture & Implementation Guide

**Date:** November 27, 2025  
**Status:** Final Proposal for Engineering Team  
**Based on:** Team Peer Review (Matthew, Swain) & Architecture Analysis

---

## 1. Executive Summary

This document outlines the definitive plan to modernize the GP-API deployment infrastructure. After reviewing our current SST-based setup and incorporating extensive feedback from the engineering team, we are proceeding with a transition to **Pure Pulumi** with **Production-Parity Preview Environments**.

### The Core Decisions

1. **Move from SST to Pure Pulumi**: Removes unnecessary abstraction layers while keeping the TypeScript infrastructure code we already know.
2. **Adopt `awsx` for ECS**: Use Pulumi's high-level Crosswalk library (`awsx`) to simplify Fargate definitions, replacing SST's abstractions with a stable, standard alternative.
3. **Production-Parity Preview Environments**: Every PR gets a fully isolated environment with its own dedicated Aurora Serverless v2 database.
4. **Reusable CI/CD Workflows**: We will extract the deployment logic into a centralized **GitHub Actions Reusable Workflow**, allowing us to share this "Preview + Deploy" automation across multiple repositories.
5. **Accept Short Downtime (Rolling Updates)**: We will postpone complex Blue/Green deployments to a future phase. For now, we accept brief downtime during deployment to avoid the strict requirement for backward-compatible database migrations.

---

## 2. Current Issues & Motivation

Our current stack (`deploy/sst.config.ts`) serves us well but has hit scaling limits:

1.  **SST Abstraction Overhead**: SST is optimized for Lambda. We use ECS Fargate. We are fighting the framework to make it work for containers.
2.  **No Preview Environments**: Developers share the `develop` environment, causing "queueing" and broken dev states.
3.  **Deployment Downtime Risks**: Current ECS rolling updates do not guarantee zero downtime during container switchovers.

---

## 3. Target Architecture

### Infrastructure Stack

- **IaC**: Pure Pulumi (TypeScript) using **`@pulumi/awsx`** for high-level abstractions.
- **State Management**: Single S3 Bucket (`gp-api-pulumi-state`) with separate paths per stack (env).
- **Compute**: AWS ECS Fargate (Rightsized: 0.25 vCPU for previews, full size for Prod).
- **Database**: Aurora Serverless v2 (PostgreSQL).
  - **Prod/QA/Dev**: Persistent clusters (Imported).
  - **Previews**: Ephemeral, dedicated clusters per PR (Created/Destroyed).
- **Queues**: AWS SQS (FIFO).
  - **Prod/QA/Dev**: Persistent queues (Imported).
  - **Previews**: Ephemeral queues per PR.
- **Deployment**: ECS Rolling Updates (Standard).
- **Orchestration**: GitHub Actions (Reusable Workflows).

### Architecture Diagram

```mermaid
graph TD
    User[Developer] -->|Opens PR| Caller[Caller Workflow (Repo A/B/C)]
    Caller -->|Uses| Reusable[Reusable Workflow (Shared)]

    subgraph "Reusable Deployment Workflow"
        Reusable -->|1. Calc Context| Context[Determine Env/Stack]
        Reusable -->|2. Provision DB/SQS| PulumiInfra[Pulumi: DB & SQS]
        Reusable -->|3. Build Image| Docker[Docker Build & Push]
        Reusable -->|4. Deploy App| PulumiApp[Pulumi: Compute/Svc]
    end

    subgraph "AWS Infrastructure (Per Environment)"
        PulumiInfra --> Aurora[Aurora Serverless v2]
        PulumiInfra --> SQS[SQS Queues]
        PulumiApp --> ECS[ECS Fargate Service]

        ECS -->|Load Balanced| ALB[App Load Balancer]

        ECS --> Aurora
        ECS --> SQS
    end

    Docker --> ECR[Amazon ECR]
```

---

## 4. Detailed Implementation Strategy

### 4.1 Database Strategy: Production Parity

Each preview environment will provision a **dedicated Aurora Serverless v2 cluster**.

- **Why**: Ensures we test migrations in an environment exactly matching production.
- **Cost**: ~$430/mo for 10 concurrent previews. Accepted as a valid investment for stability.
- **Performance**: Provisioning takes ~5-8 minutes. We will parallelize this with the Docker build step in CI/CD.

### 4.2 Deployment Strategy: Rolling Updates

_Decision: Postpone Blue/Green to avoid complexity._

We will stick with standard ECS Rolling Updates.

- **Trade-off**: Brief downtime during deployment (seconds to minutes) is acceptable for now.
- **Benefit**: We do **NOT** need to enforce strict backward compatibility for database migrations immediately. Destructive changes are allowed since we accept downtime.

### 4.3 Pulumi Implementation: `awsx` & Import Strategy

- **Library**: We will use `@pulumi/awsx` (Crosswalk), specifically `awsx.ecs.FargateService`. This provides high-level abstractions similar to SST but is more stable and standard.
- **State Backend**: A single S3 bucket (`s3://gp-api-pulumi-state`) will host all state files. Pulumi separates stacks automatically within the bucket.
- **Resource Strategy**:
  - **Stateless Resources (ECS, ALB, Security Groups)**: Re-create from scratch. Easier to manage and drift-detection is cleaner.
  - **Stateful Resources (Databases, SQS Queues, VPC)**: **IMPORT** existing resources into the new Pulumi stacks to prevent data loss.

### 4.4 Shared Automation: Reusable Workflows

_Decision: Abstract deployment logic to support multiple repositories._

We will create a **Reusable Workflow** (e.g., `.github/workflows/reusable-deploy.yml`) that defines the core deployment logic.

**Reusable Workflow Definition (`on: workflow_call`)**:

- **Inputs**: `ecr_repository`, `dockerfile_path`, `pulumi_stack_prefix`, `service_name`.
- **Secrets**: `AWS_ROLE_ARN`, `PULUMI_ACCESS_TOKEN`.
- **Jobs**: `determine-context` -> `provision-resources` -> `build-docker` -> `deploy-service`.

**Caller Workflow (In each repo):**

```yaml
name: Deploy
on:
  push:
    branches: [master, develop]
  pull_request:

jobs:
  deploy:
    uses: goodparty/infrastructure/.github/workflows/reusable-deploy.yml@v1
    with:
      ecr_repository: gp-api
      service_name: gp-api
    secrets: inherit
```

**Benefit**: We can onboard new services to this "Preview Environment + Prod Deploy" flow instantly by adding a simple caller file.

### 4.5 Infrastructure as Code (Pulumi)

We will use Pulumi with a self-hosted S3 backend.

**Secrets:**

- Transition from `process.env` injection to **AWS Secrets Manager**.
- Action: We need to populate `GP_API_PREVIEW` secret in AWS before first deployment.

---

## 5. Migration Roadmap

We will execute this in **5 Phases** to minimize risk.

### Phase 1: Foundation (Weeks 1-2)

- Create S3 State Bucket.
- Initialize new Pulumi project structure in `deploy/pulumi`.
- Implement `awsx.ecs.FargateService` pattern.
- **Goal**: Deploy a "Shadow" `develop` stack (new ECS service, new ALB) pointing to the _existing_ Dev Database (imported).

### Phase 2: Reusable CI/CD Driver (Week 3)

- Create the **Reusable Workflow** (`reusable-deploy.yml`).
- Create the **Caller Workflow** in `gp-api`.
- Connect it to the new Pulumi stacks.
- **Goal**: CI/CD can deploy to the shadow `develop` stack using the shared automation.

### Phase 3: Preview Environments (Week 4-5)

- Implement the "Dedicated Aurora" logic in Pulumi.
- Implement "Ephemeral SQS" logic.
- Enable PR triggers in the Reusable Workflow.
- Add auto-cleanup logic (destroy stack on PR close).
- **Goal**: Developers get a preview environment for new PRs.

### Phase 4: Monitoring & Refinement (Week 6)

- Add CloudWatch Dashboards.
- Create Cost Dashboard for Preview environments.
- Refine auto-scaling policies.

### Phase 5: Cutover & Cleanup (Week 7)

- Point production DNS to new Load Balancer.
- Decommission old SST stacks.
- Archive old deployment scripts.

---

## 6. Future Improvements (Post-Migration)

This section tracks valuable optimizations that are out of scope for the initial migration but should be tackled next.

1.  **Blue/Green Deployments**:
    - Implement AWS CodeDeploy for zero-downtime releases.
    - _Prerequisite_: Team must adopt "Expand-Contract" pattern for all database migrations.

2.  **Remove CodeBuild**:
    - Move the build process entirely to GitHub Actions.
    - Use **OIDC (OpenID Connect)** for secure, keyless authentication between GitHub Actions and AWS.

3.  **Canary Deployments**:
    - Once Blue/Green is stable, implement Canary releases (traffic shifting 10% -> 50% -> 100%) for production.

4.  **Spot Instances for Previews**:
    - Run preview environments on Fargate Spot instances to reduce compute costs by ~70%.

---

## 7. FAQ

**Q: How do we share the workflow across repos?**
A: We store the `reusable-deploy.yml` in a central repository (e.g., `infrastructure`) or the main `gp-api` repo. Other repos reference it via `uses: org/repo/.github/workflows/reusable-deploy.yml@main`.

**Q: Why `awsx`?**
A: `awsx` provides "Crosswalk for AWS", which are higher-level components (like `FargateService`) that abstract away the boilerplate of defining Task Definitions, Load Balancers, and Listeners manually.

**Q: Why separate DBs for Previews if we aren't doing Blue/Green yet?**
A: Because sharing a database prevents us from testing migrations safely. Dedicated DBs allow safe, isolated testing of schema changes.

**Q: Why Import existing resources?**
A: We cannot simply delete and re-create the Production Database or the persistent SQS queues without losing data/messages. Importing them into Pulumi allows us to manage them going forward without destruction.

---

## 8. Next Steps

1.  **Approve**: Sign off on this architecture plan.
2.  **Bootstrap**: Create the S3 state bucket (`gp-api-pulumi-state`).
3.  **Secrets**: Create `GP_API_PREVIEW` secret in AWS Secrets Manager.
4.  **Execute**: Begin Phase 1 (Foundation).

---

## 9. Appendix: Implementation Reference

### 9.1 Core Compute Component (using `awsx`)

Reference code for implementing Fargate services with Crosswalk (`awsx`), replacing the complex low-level AWS resources.

```typescript
// components/compute.ts
import * as pulumi from '@pulumi/pulumi'
import * as awsx from '@pulumi/awsx'

export class Compute extends pulumi.ComponentResource {
  constructor(
    name: string,
    args: ComputeArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super('gp:compute:Compute', name, {}, opts)

    // Create Application Load Balancer
    const lb = new awsx.lb.ApplicationLoadBalancer(
      `${args.stack}-alb`,
      {
        subnetIds: args.network.publicSubnetIds,
        securityGroups: [args.network.securityGroupId],
      },
      { parent: this },
    )

    // Define Fargate Service
    // awsx automatically creates: TaskDef, Service, Listeners, TargetGroups, Roles
    const service = new awsx.ecs.FargateService(
      `${args.stack}-service`,
      {
        cluster: args.clusterArn, // Can use existing or new cluster
        assignPublicIp: true, // Required for Fargate in public subnets (or use NAT)

        // Task Definition
        taskDefinitionArgs: {
          container: {
            name: 'gp-api',
            image: args.imageUri, // e.g., from ECR
            cpu: args.cpu, // 256 (.25 vCPU) for preview, 1024 for prod
            memory: args.memory, // 512 for preview, 2048 for prod
            portMappings: [{ containerPort: 80 }],
            environment: [
              { name: 'DATABASE_URL', value: args.databaseUrl },
              {
                name: 'NODE_ENV',
                value: args.isProduction ? 'production' : 'development',
              },
            ],
            secrets: [
              // Inject secrets from AWS Secrets Manager
              { name: 'JWT_SECRET', valueFrom: args.jwtSecretArn },
            ],
          },
        },

        // Load Balancer Listener
        listeners: [
          {
            port: 443,
            protocol: 'HTTPS',
            certificateArn: args.certificateArn, // ACM Certificate
            loadBalancer: lb,
          },
        ],

        desiredCount: args.desiredCount, // 1 for preview, 2+ for prod
      },
      { parent: this },
    )

    this.url = lb.loadBalancer.dnsName
  }
}
```

### 9.2 Database Component (Standard Pulumi)

Reference code for creating Aurora Serverless v2 clusters. (Remains valid as `awsx` doesn't fundamentally change RDS).

```typescript
// components/database.ts
import * as pulumi from '@pulumi/pulumi'
import * as aws from '@pulumi/aws'

// ... (Previous Database Code remains valid) ...
// Key configuration:
// serverlessv2ScalingConfiguration: {
//    maxCapacity: isProduction ? 64 : isPreview ? 2 : 4,
//    minCapacity: isProduction ? 1.0 : 0.5,
// }
```

### 9.3 Reusable Workflow Definition

Reference logic for the **Reusable Workflow** (`reusable-deploy.yml`).

```yaml
# .github/workflows/reusable-deploy.yml
name: Reusable Deployment

on:
  workflow_call:
    inputs:
      ecr_repository:
        required: true
        type: string
      service_name:
        required: true
        type: string
      pulumi_stack_prefix:
        required: false
        type: string
        default: 'gp-api'
    secrets:
      AWS_ROLE_ARN:
        required: true
      PULUMI_ACCESS_TOKEN:
        required: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: us-west-2

      - name: Determine Environment Context
        id: context
        run: |
          # Logic to determine if PR (Preview) or Push (Prod/Dev)
          # Sets STACK_NAME, CPU, MEMORY, etc.
          if [ "${{ github.event_name }}" == "pull_request" ]; then
             echo "stack=pr-${{ github.event.number }}" >> $GITHUB_OUTPUT
             echo "is_preview=true" >> $GITHUB_OUTPUT
          else
             echo "stack=${{ github.ref_name }}" >> $GITHUB_OUTPUT
             echo "is_preview=false" >> $GITHUB_OUTPUT
          fi

      - name: Login to ECR
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and Push Docker
        run: |
          docker build -t ${{ inputs.ecr_repository }}:${{ github.sha }} .
          docker push ${{ inputs.ecr_repository }}:${{ github.sha }}

      - name: Pulumi Up
        uses: pulumi/actions@v4
        with:
          command: up
          stack-name: ${{ steps.context.outputs.stack }}
        env:
          PULUMI_ACCESS_TOKEN: ${{ secrets.PULUMI_ACCESS_TOKEN }}
          # Pass Docker Image URI as config
          PULUMI_CONFIG_PASSPHRASE: ''
```

### 9.4 Future: Blue/Green with `awsx`

Reference for Phase 6. While `awsx` defaults to Rolling Updates, we can override the deployment controller.

```typescript
// components/compute.ts (Future Blue/Green)
const service = new awsx.ecs.FargateService(
  `${args.stack}-service`,
  {
    // ... other config ...

    // Override to use CodeDeploy
    service: {
      deploymentController: {
        type: 'CODE_DEPLOY',
      },
      // Note: When using CodeDeploy, we must explicitly manage
      // the TargetGroups and Listeners differently than the
      // default awsx helper, as CodeDeploy controls the traffic shifting.
      loadBalancers: [
        {
          targetGroupArn: blueTargetGroup.arn,
          containerName: 'gp-api',
          containerPort: 80,
        },
      ],
    },
  },
  { parent: this },
)
```
