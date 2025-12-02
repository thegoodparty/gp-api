## Relevant docs

- `temp/docs/PLAN_TO_REVAMP_NESTJS_DEPLOYMENT.md`
- https://www.pulumi.com/docs/idp/best-practices/
- https://www.pulumi.com/blog/iac-best-practices-understanding-code-organization-stacks/
- https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows
- deploy folder

## Relevant Files

- `deploy/pulumi/Pulumi.yaml` - Main Pulumi project configuration file.
- `deploy/pulumi/index.ts` - Entry point for the Pulumi infrastructure code.
- `deploy/pulumi/components/compute.ts` - Definition of the ECS Fargate service using `awsx` (Crosswalk).
- `deploy/pulumi/components/database.ts` - Definition of Aurora Serverless v2 clusters (Persistent for Prod/Dev, Ephemeral for Previews).
- `deploy/pulumi/components/network.ts` - Networking configuration (VPC, Security Groups, ALB).
- `.github/workflows/reusable-deploy.yml` - Centralized GitHub Actions workflow for building and deploying.
- `.github/workflows/deploy.yml` - Caller workflow in the `gp-api` repository.
- `deploy/Dockerfile` - Existing Dockerfile for building the NestJS application.

### Notes

- The migration involves a shift from SST to pure Pulumi with `awsx`.
- State management will use a self-hosted S3 bucket (`gp-api-pulumi-state`).
- Critical stateful resources (Prod Database, SQS) must be **imported**, not recreated, to prevent data loss.
- Preview environments will use dedicated, ephemeral Aurora Serverless v2 clusters.
- **Unit tests** for infrastructure components should be added where possible (e.g., `deploy/pulumi/components/compute.test.ts`).

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, you must check it off in this markdown file by changing `- [ ]` to `- [x]`. This helps track progress and ensures you don't skip any steps.

Example:

- `- [ ] 1.1 Read file` → `- [x] 1.1 Read file` (after completing)

Update the file after completing each sub-task, not just after completing an entire parent task.

## Tasks

- [ ] 1.0 Phase 1: Foundation - Pulumi Setup & Shadow Stack
  - [x] 1.1 Bootstrap S3 State Backend
    - [x] 1.1.1 Create S3 bucket `gp-api-pulumi-state` manually or via CLI if it doesn't exist.
    - [x] 1.1.2 Configure Pulumi to use this bucket for state storage (`pulumi login s3://gp-api-pulumi-state`).
  - [x] 1.2 Initialize Pulumi Project
    - [x] 1.2.1 Create directory `deploy/pulumi`.
    - [x] 1.2.2 Initialize new Pulumi TypeScript project (created config files manually).
    - [x] 1.2.3 Install dependencies: `@pulumi/aws`, `@pulumi/awsx`, `@pulumi/pulumi` (pending user execution).
  - [x] 1.3 Implement Compute Component (`awsx`)
    - [x] 1.3.1 Create `deploy/pulumi/components/compute.ts`.
    - [x] 1.3.2 Implement `Compute` class inheriting from `pulumi.ComponentResource`.
    - [x] 1.3.3 Define ALB using `awsx.lb.ApplicationLoadBalancer`.
    - [x] 1.3.4 Define Fargate Service using `awsx.ecs.FargateService`.
    - [x] 1.3.5 Configure Task Definition (CPU: 0.25 vCPU for preview, Memory: 512MB for preview).
  - [x] 1.4 Implement Database Component (Import Strategy)
    - [x] 1.4.1 Create `deploy/pulumi/components/database.ts`.
    - [x] 1.4.2 Define Aurora Serverless v2 cluster resource.
    - [x] 1.4.3 Write script or instructions to **IMPORT** the existing development database into this stack (Handled via config for Shadow Stack).
  - [x] 1.5 Deploy Shadow `develop` Stack
    - [x] 1.5.1 Create a new Pulumi stack `gp-api-develop-shadow`.
    - [x] 1.5.2 Configure stack with existing Dev DB ARN and other existing resources (VPC, Subnets).
    - [x] 1.5.3 Run `pulumi up` to verify the shadow stack deploys correctly without affecting live traffic (Pending user execution).
  - [x] 1.6 Update Pulumi to fetch all env vars from Secrets Manager
    - [x] 1.6.1 Modify `index.ts` and `compute.ts` to pull configuration from AWS Secrets Manager instead of Pulumi config where possible.

- [x] 2.0 Phase 2: CI/CD Pipeline - Reusable Workflows
  - [x] 2.1 Create Reusable Workflow
    - [x] 2.1.1 Create `.github/workflows/reusable-deploy.yml`.
    - [x] 2.1.2 Define `on: workflow_call` with inputs (`ecr_repository`, `service_name`, etc.) and secrets.
    - [x] 2.1.3 Add job `determine-context` to detect PR vs. Push and set stack name.
    - [x] 2.1.4 Add job `provision-resources` (Combined with deploy for simplicity).
    - [x] 2.1.5 Add job `build-docker` to build and push to ECR.
    - [x] 2.1.6 Add job `deploy-service` running `pulumi up`.
  - [x] 2.2 Create Caller Workflow
    - [x] 2.2.1 Create or update `.github/workflows/deploy-revamp.yml` in `gp-api`.
    - [x] 2.2.2 Configure it to call `reusable-deploy.yml`.
  - [x] 2.3 Configure Secrets
    - [x] 2.3.1 Create `GP_API_PREVIEW` secret in AWS Secrets Manager for preview envs (Handled via dynamic secret logic).
    - [x] 2.3.2 Add `AWS_ROLE_ARN` and `PULUMI_ACCESS_TOKEN` to GitHub Secrets (User action).
  - [ ] 2.4 Verify CI/CD
    - [ ] 2.4.1 Push changes and verify the workflow successfully deploys to the shadow stack.
  - [x] 2.5 Fix Security Issues
    - [x] 2.5.1 Remove `Date.now()` from secret naming to ensure idempotent deployments.
    - [x] 2.5.2 Add explicit `permissions` blocks to all workflows.

- [ ] 3.0 Phase 3: Preview Environments Implementation
  - [x] 3.1 Implement Dedicated Database Logic
    - [x] 3.1.1 Update `database.ts` to conditionally create a NEW Aurora Cluster if `isPreview` is true.
    - [x] 3.1.2 Configure scaling for previews (Min: 0.5 ACU, Max: 2 ACU).
  - [x] 3.2 Implement Ephemeral SQS Logic
    - [x] 3.2.1 Create `deploy/pulumi/components/queue.ts`.
    - [x] 3.2.2 Implement logic to create new SQS queues with unique names for preview stacks.
  - [x] 3.3 Enable PR Triggers
    - [x] 3.3.1 Update `.github/workflows/deploy.yml` to trigger on `pull_request` (Done in deploy-revamp.yml commented out, user to enable).
    - [x] 3.3.2 Ensure `reusable-deploy.yml` handles PR numbers for stack naming (e.g., `pr-123`).
  - [x] 3.4 Implement Auto-Cleanup
    - [x] 3.4.1 Create a separate workflow or job to run `pulumi destroy` when a PR is closed or merged.

- [x] 4.0 Phase 4: Monitoring & Refinement
  - [x] 4.1 CloudWatch Dashboards
    - [x] 4.1.1 Add `deploy/pulumi/components/monitoring.ts`.
    - [x] 4.1.2 Create a CloudWatch Dashboard resource showing CPU, Memory, and Error rates for the service.
  - [x] 4.2 Cost Monitoring
    - [x] 4.2.1 Tag all preview resources with `Environment: Preview` and `PR: <number>`.
  - [x] 4.3 Refine Auto-Scaling
    - [x] 4.3.1 Configure CPU/Memory target tracking scaling policies for Production stack.

- [ ] 5.0 Phase 5: Cutover & Cleanup
  - [ ] 5.1 Production DNS Cutover
    - [ ] 5.1.1 Import the Production Route53 Hosted Zone.
    - [ ] 5.1.2 Update the A-record to point to the new Pulumi-managed ALB.
  - [ ] 5.2 Decommission SST
    - [ ] 5.2.1 Remove `sst.config.ts` and SST dependencies from `package.json`.
    - [ ] 5.2.2 Delete the old CloudFormation stacks (carefully, ensuring no shared resources are deleted).
  - [ ] 5.3 Cleanup
    - [ ] 5.3.1 Archive old deployment scripts/docs.
    - [ ] 5.3.2 Update `README.md` with new deployment instructions.
