///  <reference types="./.sst/platform/config.d.ts" />

const serveAnalysisBucketName = {
  develop: 'serve-analyze-data-dev',
  qa: 'serve-analyze-data-qa',
  master: 'serve-analyze-data-prod',
}

const environment = {
  develop: 'dev',
  qa: 'qa',
  master: 'prod',
}

export default $config({
  app(input) {
    return {
      name: 'gp',
      removal: input.stage === 'master' ? 'retain' : 'remove',
      home: 'aws',
      providers: {
        aws: {
          region: 'us-west-2',
          version: '6.67.0',
          defaultTags: {
            tags: {
              Project: 'gp-api',
              // @ts-expect-error
              Environment: environment[input.stage],
            },
          },
        },
      },
    }
  },
  async run() {
    const { default: aws } = await import('@pulumi/aws')
    const { default: pulumi } = await import('@pulumi/pulumi')
    const { lambda } = await import('./utils/lambda')
    const vpc =
      $app.stage === 'master'
        ? new sst.aws.Vpc('api', {
            bastion: false,
            nat: 'managed',
            az: 2, // defaults to 2 availability zones and 2 NAT gateways
          })
        : sst.aws.Vpc.get('api', 'vpc-0763fa52c32ebcf6a') // other stages will use same vpc.

    if (
      $app.stage !== 'master' &&
      $app.stage !== 'develop' &&
      $app.stage !== 'qa'
    ) {
      throw new Error(
        'Invalid stage. Only master, qa and develop are supported.',
      )
    }

    let bucketDomain: string
    let apiDomain: string
    let webAppRootUrl: string
    if ($app.stage === 'master') {
      apiDomain = 'gp-api.goodparty.org'
      bucketDomain = 'assets.goodparty.org'
      webAppRootUrl = 'https://goodparty.org'
    } else if ($app.stage === 'develop') {
      apiDomain = 'gp-api-dev.goodparty.org'
      bucketDomain = 'assets-dev.goodparty.org'
      webAppRootUrl = 'https://dev.goodparty.org'
    } else if ($app.stage === 'qa') {
      apiDomain = 'gp-api-qa.goodparty.org'
      bucketDomain = 'assets-qa.goodparty.org'
      webAppRootUrl = 'https://qa.goodparty.org'
    } else {
      apiDomain = `gp-api-${$app.stage}.goodparty.org`
      bucketDomain = `assets-${$app.stage}.goodparty.org`
      webAppRootUrl = `https://app-${$app.stage}.goodparty.org`
    }

    let assetsBucket
    if ($app.stage === 'master') {
      assetsBucket = sst.aws.Bucket.get('assetsBucket', 'assets.goodparty.org')
    } else {
      // Each stage will get its own Bucket.
      assetsBucket = new sst.aws.Bucket('assets', {
        access: 'cloudfront',
        // use a transformation to set the bucket name to the bucketDomain.
        transform: {
          bucket: {
            bucket: bucketDomain,
          },
        },
      })
    }

    if ($app.stage !== 'master') {
      // production bucket was setup manually. so no need to setup cloudfront.
      new sst.aws.Router(`assets-${$app.stage}`, {
        routes: {
          '/*': {
            bucket: assetsBucket,
          },
        },
        domain: bucketDomain,
      })
    }

    // function to extract the username, password, and database name from the database url
    // which the docker container needs to run migrations.
    const extractDbCredentials = (dbUrl: string) => {
      const url = new URL(dbUrl)
      const username = url.username
      const password = url.password
      const database = url.pathname.slice(1)
      return { username, password, database }
    }

    // Each stage will get its own Cluster.
    const cluster = new sst.aws.Cluster('fargate', { vpc })

    let dbUrl: string | undefined
    let dbName: string | undefined
    let dbUser: string | undefined
    let dbPassword: string | undefined
    let voterDbName: string | undefined
    let voterDbUser: string | undefined
    let voterDbPassword: string | undefined
    let vpcCidr: string | undefined

    // Fetch the JSON secret using Pulumi's AWS SDK
    let secretArn: string | undefined
    if ($app.stage === 'master') {
      secretArn =
        'arn:aws:secretsmanager:us-west-2:333022194791:secret:GP_API_PROD-kvf2EI'
    } else if ($app.stage === 'develop') {
      secretArn =
        'arn:aws:secretsmanager:us-west-2:333022194791:secret:GP_API_DEV-ag7Mf4'
    } else if ($app.stage === 'qa') {
      secretArn =
        'arn:aws:secretsmanager:us-west-2:333022194791:secret:GP_API_QA-w290tg'
    }

    if (!secretArn) {
      throw new Error(
        'No secretArn found for this stage. secretArn must be configured.',
      )
    }

    const secretVersion = aws.secretsmanager.getSecretVersion({
      secretId: secretArn,
    })

    // Use async/await to get the actual secret value
    const secretString = await secretVersion.then((v) => v.secretString)

    const secrets: object[] = []
    let secretsJson: Record<string, string> = {}
    try {
      secretsJson = JSON.parse(secretString || '{}')

      // DO NOT REMOVE THESE. These are here so that we don't use the AWS credentials
      // that were (at some point) hardcoded in the secret. Instead, we want to make sure
      // our instances use their NATIVE IAM roles, so that we can easily manage their
      // permissions as-code.
      //
      // Once the migration to IAM auth is complete, we can remove these values from the
      // secret entirely, and then remove these lines.
      delete secretsJson.AWS_ACCESS_KEY_ID
      delete secretsJson.AWS_SECRET_ACCESS_KEY
      delete secretsJson.AWS_S3_KEY
      delete secretsJson.AWS_S3_SECRET

      for (const [key, value] of Object.entries(secretsJson)) {
        if (key === 'DATABASE_URL') {
          const { username, password, database } = extractDbCredentials(
            value as string,
          )
          dbUrl = value as string
          dbName = database
          dbUser = username
          dbPassword = password
        }
        if (key === 'VPC_CIDR') {
          vpcCidr = value as string
        }
        if (key === 'VOTER_DATASTORE') {
          const { username, password, database } = extractDbCredentials(
            value as string,
          )
          voterDbName = database
          voterDbUser = username
          voterDbPassword = password
        }
        secrets.push({ key: value })
      }
    } catch (e) {
      throw new Error(
        'Failed to parse GP_SECRETS JSON: ' + (e as Error).message,
      )
    }

    if (!dbName || !dbUser || !dbPassword || !vpcCidr || !dbUrl) {
      throw new Error('DATABASE_URL, VPC_CIDR keys must be set in the secret.')
    }

    const sqsQueueName = `${$app.stage}-Queue.fifo`
    const sqsDlqName = `${$app.stage}-DLQ.fifo`

    // Create Dead Letter Queue
    const dlq = new aws.sqs.Queue(`${$app.stage}-dlq`, {
      name: sqsDlqName,
      fifoQueue: true,
      messageRetentionSeconds: 7 * 24 * 60 * 60, // 7 days
    })

    // Create Main Queue
    new aws.sqs.Queue(`${$app.stage}-queue`, {
      name: sqsQueueName,
      fifoQueue: true,
      visibilityTimeoutSeconds: 300, // 5 minutes
      messageRetentionSeconds: 7 * 24 * 60 * 60, // 7 days
      delaySeconds: 0,
      receiveWaitTimeSeconds: 0,
      deduplicationScope: 'messageGroup',
      fifoThroughputLimit: 'perMessageGroupId',
      redrivePolicy: pulumi.interpolate`{
        "deadLetterTargetArn": "${dlq.arn}",
        "maxReceiveCount": 3
      }`,
    })

    // Create shared VPC Endpoint for SQS (only in master stage)
    if ($app.stage === 'master') {
      // Create security group for SQS
      const sqsSecurityGroup = new aws.ec2.SecurityGroup('sqs-sg', {
        vpcId: 'vpc-0763fa52c32ebcf6a',
        ingress: [
          {
            protocol: 'tcp',
            fromPort: 443,
            toPort: 443,
            cidrBlocks: [vpcCidr],
          },
        ],
        egress: [
          {
            protocol: '-1',
            fromPort: 0,
            toPort: 0,
            cidrBlocks: ['0.0.0.0/0'],
          },
        ],
      })

      new aws.ec2.VpcEndpoint('sqs-endpoint', {
        vpcId: 'vpc-0763fa52c32ebcf6a',
        serviceName: `com.amazonaws.us-west-2.sqs`,
        vpcEndpointType: 'Interface',
        subnetIds: ['subnet-053357b931f0524d4', 'subnet-0bb591861f72dcb7f'],
        securityGroupIds: [sqsSecurityGroup.id],
        privateDnsEnabled: true,
      })
    }

    const HANDLER_TIMEOUT = 30

    const pollInsightsQueueDlq = new aws.sqs.Queue(
      `poll-insights-queue-dlq-${$app.stage}`,
      {
        name: `poll-insights-queue-dlq-${$app.stage}.fifo`,
        fifoQueue: true,
        messageRetentionSeconds: 7 * 24 * 60 * 60, // 7 days
      },
    )

    const pollInsightsQueue = new aws.sqs.Queue(
      `poll-insights-queue-${$app.stage}`,
      {
        name: `poll-insights-queue-${$app.stage}.fifo`,
        fifoQueue: true,
        messageRetentionSeconds: 7 * 24 * 60 * 60, // 7 days
        visibilityTimeoutSeconds: HANDLER_TIMEOUT + 5,
        contentBasedDeduplication: true,
        redrivePolicy: pulumi.interpolate`{
          "deadLetterTargetArn": "${pollInsightsQueueDlq.arn}",
          "maxReceiveCount": 3
        }`,
      },
    )

    const pollInsightsQueueHandler = lambda(aws, pulumi, {
      name: `poll-insights-queue-handler-${$app.stage}`,
      runtime: 'nodejs22.x',
      timeout: HANDLER_TIMEOUT,
      memorySize: 512,
      filename: 'poll-response-analysis-queue-handler',
      policy: [
        {
          actions: [
            'sqs:ReceiveMessage',
            'sqs:DeleteMessage',
            'sqs:GetQueueAttributes',
          ],
          resources: [pollInsightsQueue.arn],
        },
      ],
    })

    new aws.lambda.EventSourceMapping(`poll-insights-queue-${$app.stage}`, {
      eventSourceArn: pollInsightsQueue.arn,
      functionName: pollInsightsQueueHandler.name,
      enabled: true,
      batchSize: 10,
      functionResponseTypes: ['ReportBatchItemFailures'],
    })

    // todo: may need to add sqs queue policy to allow access from the vpc endpoint.
    cluster.addService(`gp-api-${$app.stage}`, {
      loadBalancer: {
        domain: apiDomain,
        ports: [
          { listen: '80/http' },
          { listen: '443/https', forward: '80/http' },
        ],
        health: {
          '80/http': {
            path: '/v1/health',
            interval: '30 seconds',
          },
        },
      },
      // https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-tasks-services.html#fargate-tasks-size
      capacity: {
        fargate: { weight: 1 },
      },
      memory: $app.stage === 'master' ? '4 GB' : '2 GB', // ie: 1 GB, 2 GB, 3 GB, 4 GB, 5 GB, 6 GB, 7 GB, 8 GB
      cpu: $app.stage === 'master' ? '1 vCPU' : '0.5 vCPU', // ie: 1 vCPU, 2 vCPU, 3 vCPU, 4 vCPU, 5 vCPU, 6 vCPU, 7 vCPU, 8 vCPU
      scaling: {
        min: $app.stage === 'master' ? 2 : 1,
        max: $app.stage === 'master' ? 16 : 4,
        cpuUtilization: 50,
        memoryUtilization: 50,
      },
      environment: {
        // PORT: '3000',
        PORT: '80',
        HOST: '0.0.0.0',
        LOG_LEVEL: 'debug',
        CORS_ORIGIN:
          $app.stage === 'master' ? 'goodparty.org' : 'dev.goodparty.org',
        AWS_REGION: 'us-west-2',
        ASSET_DOMAIN: bucketDomain,
        WEBAPP_ROOT_URL: webAppRootUrl,
        AI_MODELS:
          'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8,Qwen/Qwen3-235B-A22B-fp8-tput',
        LLAMA_AI_ASSISTANT: 'asst_GP_AI_1.0',
        SQS_QUEUE: sqsQueueName,
        SQS_QUEUE_BASE_URL: 'https://sqs.us-west-2.amazonaws.com/333022194791',
        SERVE_ANALYSIS_BUCKET_NAME: serveAnalysisBucketName[$app.stage],
        ...secretsJson,
      },
      image: {
        context: '../', // Set the context to the main app directory
        dockerfile: './deploy/Dockerfile',
        args: {
          DOCKER_BUILDKIT: '1',
          CACHEBUST: secretsJson?.CACHEBUST || Date.now().toString(),
          DOCKER_USERNAME: process.env.DOCKER_USERNAME || '',
          DOCKER_PASSWORD: process.env.DOCKER_PASSWORD || '',
          DATABASE_URL: dbUrl, // so we can run migrations.
          STAGE: $app.stage,
        },
      },
      link: [assetsBucket],
      transform: {
        loadBalancer: {
          idleTimeout: 120,
        },
      },
      permissions: [
        {
          actions: ['route53domains:Get*', 'route53domains:List*'],
          resources: ['*'],
        },
        {
          actions: ['route53domains:CheckDomainAvailability'],
          resources: ['*'],
        },
        {
          actions: ['s3:*', 's3-object-lambda:*'],
          resources: ['*'],
        },
        {
          actions: ['sqs:*'],
          resources: ['*'],
        },
      ],
    })

    // Create a Security Group for the RDS Cluster
    const rdsSecurityGroup = new aws.ec2.SecurityGroup('rdsSecurityGroup', {
      name:
        $app.stage === 'develop'
          ? 'api-rds-security-group'
          : `api-${$app.stage}-rds-security-group`,
      description: 'Allow traffic to RDS',
      vpcId: 'vpc-0763fa52c32ebcf6a',
      ingress: [
        {
          protocol: 'tcp',
          fromPort: 5432,
          toPort: 5432,
          cidrBlocks: [vpcCidr],
        },
        // Allow access from Codebuild's security group
        {
          protocol: 'tcp',
          fromPort: 5432,
          toPort: 5432,
          securityGroups: ['sg-01de8d67b0f0ec787'], // Codebuild SG ID
        },
      ],
      egress: [
        {
          protocol: '-1',
          fromPort: 0,
          toPort: 0,
          cidrBlocks: ['0.0.0.0/0'],
        },
      ],
    })

    // Create a Subnet Group for the RDS Cluster (using our private subnets)
    const subnetGroup = new aws.rds.SubnetGroup('subnetGroup', {
      name:
        $app.stage === 'develop'
          ? 'api-rds-subnet-group'
          : `api-${$app.stage}-rds-subnet-group`,
      subnetIds: ['subnet-053357b931f0524d4', 'subnet-0bb591861f72dcb7f'],
      tags: {
        Name: `api-${$app.stage}-rds-subnet-group`,
      },
    })

    // Warning: Do not change the clusterIdentifier.
    // The clusterIdentifier is used as a unique identifier for your RDS cluster.
    // Changing it will cause Pulumi/SST to try to create a new RDS cluster and delete the old one
    // which would result in data loss. This is because the clusterIdentifier is part of the cluster's
    // identity and cannot be modified in place.
    let rdsCluster: aws.rds.Cluster | undefined
    if ($app.stage === 'master') {
      rdsCluster = new aws.rds.Cluster('rdsCluster', {
        clusterIdentifier: 'gp-api-db-prod',
        engine: aws.rds.EngineType.AuroraPostgresql,
        engineMode: aws.rds.EngineMode.Provisioned,
        engineVersion: '16.8',
        databaseName: dbName,
        masterUsername: dbUser,
        masterPassword: dbPassword,
        dbSubnetGroupName: subnetGroup.name,
        vpcSecurityGroupIds: [rdsSecurityGroup.id],
        storageEncrypted: true,
        deletionProtection: true,
        finalSnapshotIdentifier: `gp-api-db-${$app.stage}-final-snapshot`,
        serverlessv2ScalingConfiguration: {
          maxCapacity: 64,
          minCapacity: $app.stage === 'master' ? 1.0 : 0.5,
        },
      })

      const voterDbProdConfig = {
        clusterIdentifier: 'gp-voter-db',
        engine: aws.rds.EngineType.AuroraPostgresql,
        engineMode: aws.rds.EngineMode.Provisioned,
        engineVersion: '16.8',
        databaseName: voterDbName,
        masterUsername: voterDbUser,
        masterPassword: voterDbPassword,
        dbSubnetGroupName: subnetGroup.name,
        vpcSecurityGroupIds: [rdsSecurityGroup.id],
        storageEncrypted: true,
        deletionProtection: true,
        finalSnapshotIdentifier: `gp-voter-db-${$app.stage}-final-snapshot`,
        serverlessv2ScalingConfiguration: {
          maxCapacity: 128,
          minCapacity: 0.5,
        },
      }
      const voterCluster = new aws.rds.Cluster(
        'voterCluster',
        voterDbProdConfig,
      )

      new aws.rds.ClusterInstance('voterInstance', {
        clusterIdentifier: voterCluster.id,
        instanceClass: 'db.serverless',
        engine: aws.rds.EngineType.AuroraPostgresql,
        engineVersion: voterCluster.engineVersion,
      })

      // Second voter cluster for database swap operation
      const voterClusterLatest = new aws.rds.Cluster('voterClusterLatest', {
        ...voterDbProdConfig,
        clusterIdentifier: 'gp-voter-db-20250728',
        finalSnapshotIdentifier: `gp-voter-db-${$app.stage}-20250728-final-snapshot`,
      })

      new aws.rds.ClusterInstance('voterInstanceLatest', {
        clusterIdentifier: voterClusterLatest.id,
        instanceClass: 'db.serverless',
        engine: aws.rds.EngineType.AuroraPostgresql,
        engineVersion: voterClusterLatest.engineVersion,
      })
    } else if ($app.stage === 'qa') {
      rdsCluster = new aws.rds.Cluster('rdsCluster', {
        clusterIdentifier: 'gp-api-db-qa',
        engine: aws.rds.EngineType.AuroraPostgresql,
        engineMode: aws.rds.EngineMode.Provisioned,
        engineVersion: '16.8',
        databaseName: dbName,
        masterUsername: dbUser,
        masterPassword: dbPassword,
        dbSubnetGroupName: subnetGroup.name,
        vpcSecurityGroupIds: [rdsSecurityGroup.id],
        storageEncrypted: true,
        deletionProtection: true,
        finalSnapshotIdentifier: `gp-api-db-${$app.stage}-final-snapshot`,
        serverlessv2ScalingConfiguration: {
          maxCapacity: 64,
          minCapacity: 0.5,
        },
      })
    } else if ($app.stage === 'develop') {
      rdsCluster = aws.rds.Cluster.get('rdsCluster', 'gp-api-db')

      const voterCluster = new aws.rds.Cluster('voterCluster', {
        clusterIdentifier: `gp-voter-db-${$app.stage}`,
        engine: aws.rds.EngineType.AuroraPostgresql,
        engineMode: aws.rds.EngineMode.Provisioned,
        engineVersion: '16.8',
        databaseName: voterDbName,
        masterUsername: voterDbUser,
        masterPassword: voterDbPassword,
        dbSubnetGroupName: subnetGroup.name,
        vpcSecurityGroupIds: [rdsSecurityGroup.id],
        storageEncrypted: true,
        deletionProtection: true,
        finalSnapshotIdentifier: `gp-voter-db-${$app.stage}-final-snapshot`,
        serverlessv2ScalingConfiguration: {
          maxCapacity: 128,
          minCapacity: 0.5,
        },
      })

      new aws.rds.ClusterInstance('voterInstance', {
        clusterIdentifier: voterCluster.id,
        instanceClass: 'db.serverless',
        engine: aws.rds.EngineType.AuroraPostgresql,
        engineVersion: voterCluster.engineVersion,
      })
    } else {
      rdsCluster = aws.rds.Cluster.get('rdsCluster', 'gp-api-db')
    }

    new aws.rds.ClusterInstance('rdsInstance', {
      clusterIdentifier: rdsCluster.id,
      instanceClass: 'db.serverless',
      engine: aws.rds.EngineType.AuroraPostgresql,
      engineVersion: rdsCluster.engineVersion,
    })

    // Create an IAM Role for CodeBuild
    const codeBuildRole = new aws.iam.Role('codebuild-service-role', {
      assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
        Service: 'codebuild.amazonaws.com',
      }),
      managedPolicyArns: ['arn:aws:iam::aws:policy/AdministratorAccess'],
    })

    // buildspec updated to use file with env vars.
    new aws.codebuild.Project('gp-deploy-build', {
      name: `gp-deploy-build-${$app.stage}`,
      serviceRole: codeBuildRole.arn,
      environment: {
        computeType: 'BUILD_GENERAL1_LARGE',
        image: 'aws/codebuild/standard:6.0',
        type: 'LINUX_CONTAINER',
        privilegedMode: true,
        environmentVariables: [
          {
            name: 'STAGE',
            value: $app.stage,
            type: 'PLAINTEXT',
          },
          {
            name: 'CLUSTER_NAME',
            value: `gp-${$app.stage}-fargateCluster`,
            type: 'PLAINTEXT',
          },
          {
            name: 'SERVICE_NAME',
            value: `gp-api-${$app.stage}`,
            type: 'PLAINTEXT',
          },
          {
            name: 'CACHEBUST',
            value: secretsJson?.CACHEBUST || Date.now().toString(),
            type: 'PLAINTEXT',
          },
        ],
      },
      vpcConfig: {
        vpcId: 'vpc-0763fa52c32ebcf6a',
        subnets: ['subnet-053357b931f0524d4', 'subnet-0bb591861f72dcb7f'],
        securityGroupIds: ['sg-01de8d67b0f0ec787'],
      },
      source: {
        type: 'GITHUB',
        location: 'https://github.com/thegoodparty/gp-api.git',
        buildspec: 'deploy/buildspec.yml',
      },
      artifacts: {
        type: 'NO_ARTIFACTS',
      },
    })

    // Create an IAM Policy for Github actions
    new aws.iam.Policy('github-actions-policy', {
      description: 'Limited policy for Github Actions to trigger CodeBuild',
      policy: pulumi.output({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: [
              'codebuild:StartBuild',
              'codebuild:BatchGetBuilds',
              'codebuild:ListBuildsForProject',
            ],
            Resource: 'arn:aws:codebuild:us-west-2:333022194791:project/*',
          },
          {
            Effect: 'Allow',
            Action: ['codebuild:ListProjects'],
            Resource: '*',
          },
          {
            Effect: 'Allow',
            Action: ['logs:GetLogEvents', 'logs:FilterLogEvents'],
            Resource: pulumi.interpolate`arn:aws:logs:us-west-2:333022194791:log-group:/aws/codebuild/*`,
          },
        ],
      }),
    })
  },
})
