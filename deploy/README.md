# Deployment Guide for gp-api

This guide provides comprehensive instructions for deploying the gp-api application using SSTv3, AWS Fargate, and related infrastructure.

## Table of Contents

1. [Usage](#usage)
   - [Install Dependencies](#install-dependencies)
   - [Deploy the Application](#deploy-the-application)
2. [Environment Variables](#environment-variables)
3. [Database Configuration](#database-configuration)
4. [VPC Configuration](#vpc-configuration)
5. [Continuous Integration/Continuous Deployment (CI/CD)](#continuous-integrationcontinuous-deployment-cicd)
   - [ECS Deployment Details](#ecs-deployment-details)
6. [Logs](#logs)
7. [Benefits](#benefits)
   - [Why Use AWS Fargate?](#why-use-aws-fargate)
   - [Why Use SST and Pulumi?](#why-use-sst-and-pulumi)
8. [Resources](#resources)

## Usage

### Install Dependencies

First, ensure you have all necessary dependencies installed. You need Node.js, aws-cli, and you must configure the region and credentials in the `~./aws/configuration` file.

Install the deploy npm dependencies:

```bash
cd deploy/
npm install
```

### Deploy the Application (cli)

Use the following commands to deploy the application from the deploy folder:

```bash
# Deploy to the 'develop' stage
npx sst deploy --stage develop

# Deploy to the 'master' stage
npx sst deploy --stage master
```

## Environment Variables

To add environment variables to the application, use AWS Secrets Manager:

1. Create a plaintext secret in AWS Secrets Manager.
2. Provide the secret's ARN under the SSM configuration for the service in the deployment settings.

This ensures secure storage and retrieval of environment-specific variables.

## Database Configuration

The application uses **Amazon RDS Serverless v2** for PostgreSQL. Key considerations:

- **Accessing the Database**: You must be connected to the VPC to access the database. Use the VPN service to establish the connection.
- **Scaling Configuration**: Occasionally, the `serverlessv2ScalingConfiguration` may need to be updated to increase the `minCapacity` to prevent cold start times.

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

This project is configured with SST's auto-deployment feature. Simply push changes to the `gp-api` repository, and the CI/CD pipeline will trigger a CodeBuild process to deploy the updates automatically.

### ECS Deployment Details

- **ECS Service**: Manages the API deployment on AWS Fargate.
- **ECS Tasks**: Containers running as part of the service are defined by the ECS Task Definition.
- **ECS Task Definition**: Specifies the container image, resources, and environment variables required for the application.
- **Deployment Process**: When auto-deployment is triggered:
  1. CodeBuild builds the application and uploads the new Docker image to Amazon ECR.
  2. ECS initiates an A/B deployment for the service.
  3. Deployment status can be tracked in the **Deployments** tab of the ECS service in the AWS Management Console.

**Learn more about ECS:** [ECS Documentation](https://aws.amazon.com/ecs/documentation/)

## Logs

Logging is critical for troubleshooting and monitoring.

- **Runner Logs**:

  - Located in a CloudWatch log group dedicated to the build process at `/aws/codebuild/sst-runner`
  - Use these logs to troubleshoot issues related to building the image or running migrations.

- **API Logs**:
  - Each stage has its own Fargate cluster and Fargate service, with a corresponding CloudWatch log group at `/sst/cluster/gp-stage-fargateCluster/gp-api-stage/gp-api-stage`
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

## Resources

- [SST Documentation](https://sst.dev)
- [Pulumi Documentation](https://www.pulumi.com)
- [ECS Documentation](https://docs.aws.amazon.com/ecs/)
