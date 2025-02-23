# Deployment Guide for gp-api

This guide provides comprehensive instructions for deploying the gp-api application using SSTv3, AWS Fargate, RDS Serverless Aurora Postgres and related infrastructure.

## Table of Contents

1. [Usage](#usage)
   - [Install Dependencies](#install-dependencies)
   - [Deploy the Application](#deploy-the-application)
   - [Deployment Secrets](#deployment-secrets)
   - [State Management](#state-management)
2. [Environment Variables](#environment-variables)
3. [Scaling Configuration](#scaling)
4. [Database Configuration](#database-configuration)
5. [VPC Configuration](#vpc-configuration)
6. [Continuous Integration/Continuous Deployment (CI/CD)](#continuous-integrationcontinuous-deployment-cicd)
   - [ECS Deployment Details](#ecs-deployment-details)
7. [Logs](#logs)
8. [Benefits](#benefits)
   - [Why Use AWS Fargate?](#why-use-aws-fargate)
   - [Why Use SST and Pulumi?](#why-use-sst-and-pulumi)
9. [Resources](#resources)

## Usage

### Install Dependencies

First, ensure you have all necessary dependencies installed. You need Node.js, aws-cli, and you must configure the region and credentials in the `~./aws/configuration` file.

Install the deploy npm dependencies:

```bash
cd deploy/
npm install
```

### Deploy the Application (cli)

Note: you should never really need to deploy from the cli (see the [CI/CD section](#continuous-integrationcontinuous-deployment-cicd) below)
Because CI/CD will take care of the deployment process.
However, if you are working on the config or need to debug it can be helpful to deploy locally.
Use the following commands to deploy the application from the deploy folder:

```bash
# Deploy to the 'develop' stage
npx sst deploy --stage develop

# Deploy to the 'master' stage
npx sst deploy --stage master
```

### State Management

If someone changes something in aws instead of doing it through SST, you can update the state by running:

```bash
npx sst --stage <stage> refresh
```

If the configs are different, it’ll update the state to reflect the change. If the resource doesn’t exist anymore, it’ll remove it from the state.

### Deployment Secrets

Note: these secrets are only for the deployment phase. For application secrets see: [Environment Variables](#environment-variables).

We no longer use the built in sst secrets. We now have one secret for each stage in AWS Secrets Manager. The secret must contain the following keys:

- `DATABASE_URL`
- `VPC_CIDR`

As well as any other variables that are required for the deployment of the service. The secret must be created in AWS Secrets Manager and then the ARN must be added to the right stage in the `sst.config.ts` file.

## Scaling

- **Database Scaling Configuration**: Occasionally, the `serverlessv2ScalingConfiguration` may need to be updated to increase the `minCapacity` to prevent cold start times on the database.
- **Task Configuration**: The ECS tasks `memory` and `cpu` in the sst.config.ts can easily be adjusted if we decide we want each Task to be able to handle more load or if the need arises for more ram per task.
- **Task Autoscaling Configuration**: We can adjust the `scaling` params to set the minimum and maximum amount of Task concurrency for each stage to enable autoscaling and also we can adjust the memory/ram requirements for launching a new task. The master stage should always have a minimum of 2 Tasks for A/B Deployment or there will be downtime during updates.

## Environment Variables

To add environment variables to the application, use AWS Secrets Manager:

1. Create a plaintext secret in AWS Secrets Manager.
2. Provide the secret's ARN for the correct stage in the `sst.config.ts`

This ensures secure storage and retrieval of environment-specific variables.

## Database Configuration

The application uses **Amazon RDS Serverless v2** for PostgreSQL. Key considerations:

- **Accessing the Database**: You must be connected to the VPC to access the database. Use the VPN service to establish the connection.

Database migrations are automatically applied during deployment using:

```bash
npx prisma migrate deploy
```

## VPC Configuration

The deployment utilizes a shared VPC (`gp-api-master VPC`) with the following characteristics:

- **Availability Zones**: Two AZs, each with a public and private subnet.
- **NAT Gateways**: One NAT Gateway per AZ for outbound internet access from private subnets.
- **Shared VPC**: All stages share the same VPC to optimize resource usage and simplify management.

Both the Fargate cluster and the RDS database are configured to use this VPC.

## Continuous Integration/Continuous Deployment (CI/CD)

This project is configured with a github actions workflow to kick off a codebuild deployment. Simply push changes to the `gp-api` repository, and the CI/CD pipeline will trigger a CodeBuild process to build the project on the latest node image and upload it to ECR and deploy it automatically on Fargate.

### ECS Deployment Details

- **ECS Service**: Manages the API deployment on AWS Fargate.
- **ECS Tasks**: Containers running as part of the service are defined by the ECS Task Definition.
- **ECS Task Definition**: Specifies the container image, resources, and environment variables required for the application.
- **Deployment Process**: When auto-deployment is triggered:
  1. CodeBuild builds the application and uploads the new Docker image to Amazon ECR.
  2. Github actions initiates an update of the ECS service causing a new Deployment.
  3. Deployment status can be tracked in the **Deployments** tab of the ECS service in the AWS Management Console.

## Logs

Logging is critical for troubleshooting and monitoring.

- **Runner Logs**:

  - Located in a CloudWatch log group dedicated to the build process at `/aws/codebuild/gp-deploy-build-<stage>`
  - Use these logs to troubleshoot issues related to building the image or running migrations.

- **API Logs**:
  - Each stage has its own Fargate cluster and Fargate service, with a corresponding CloudWatch log group at `/sst/cluster/gp-<stage>-fargateCluster/gp-api-<stage>/gp-api-<stage>`
  - Use the logs to debug application-specific issues.
  - Task logs can also be found in the Logs section of the ECS Service for each stage.

## Benefits

### Why Use AWS Fargate?

- **Serverless Architecture**: Fargate eliminates the need for managing EC2 instances.
- **Scalability**: Automatically scales based on container workload.
- **Cost-Effective**: Pay only for the resources used by containers.

### Why Use SST and Pulumi?

- **Infrastructure as Code (IaC)**: SST and Pulumi provide declarative configuration, ensuring repeatable and predictable deployments.
- **Integration**: Simplifies working with AWS services like Lambda, RDS, and Fargate.
- **Development Experience**: Includes features like live debugging, automatic CI/CD pipelines, and staging environments.

## General Resources

- [SST Documentation](https://sst.dev)
- [Pulumi Documentation](https://www.pulumi.com)
- [ECS Documentation](https://docs.aws.amazon.com/ecs/)

## Specific Resources

- [SST Cluster Construct](https://sst.dev/docs/component/aws/cluster)
- [SST Secret Construct](https://sst.dev/docs/component/secret/)
- [SST VPC Construct](https://sst.dev/docs/component/aws/vpc)
- [Pulumi RDS Construct](https://www.pulumi.com/registry/packages/aws/api-docs/rds/cluster/)
