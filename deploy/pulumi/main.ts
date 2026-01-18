import * as pulumi from '@pulumi/pulumi'
import * as aws from '@pulumi/aws'
import { extractDbCredentials } from './utils'
import { createService } from './main-components/service'
import { createAssetsBucket } from './main-components/assets-bucket'
import { createAssetsRouter } from './main-components/assets-router'
import { createVpc } from './main-components/vpc'

export = async () => {
  const stack = pulumi.getStack()
  const config = new pulumi.Config()

  const environment = config.require('environment') as 'dev' | 'qa' | 'prod'

  const vpcId = 'vpc-0763fa52c32ebcf6a'
  const vpcCidr = '10.0.0.0/16'
  const hostedZoneId = 'Z10392302OXMPNQLPO07K'

  const vpcSubnetIds = {
    public: ['subnet-07984b965dabfdedc', 'subnet-01c540e6428cdd8db'],
    private: ['subnet-053357b931f0524d4', 'subnet-0bb591861f72dcb7f'],
  }
  const vpcSecurityGroupIds = ['sg-01de8d67b0f0ec787']

  const stage = {
    dev: 'develop' as const,
    qa: 'qa' as const,
    prod: 'master' as const,
  }[environment]

  const select = <T>(values: Record<'dev' | 'qa' | 'prod', T>): T =>
    values[environment]

  // Production deploy manages the VPC. The actual VPC details are hard-coded above as individual variables.
  if (environment === 'prod') {
    createVpc()
  }

  const { secretString: secretJson } =
    await aws.secretsmanager.getSecretVersion({
      secretId: select({
        dev: 'arn:aws:secretsmanager:us-west-2:333022194791:secret:GP_API_DEV-ag7Mf4',
        qa: 'arn:aws:secretsmanager:us-west-2:333022194791:secret:GP_API_QA-w290tg',
        prod: 'arn:aws:secretsmanager:us-west-2:333022194791:secret:GP_API_PROD-kvf2EI',
      }),
    })

  const secret: Record<string, string> = JSON.parse(secretJson)
  // DO NOT REMOVE THESE. These are here so that we don't use the AWS credentials
  // that were (at some point) hardcoded in the secret. Instead, we want to make sure
  // our instances use their NATIVE IAM roles, so that we can easily manage their
  // permissions as-code.
  //
  // Once the migration to IAM auth is complete, we can remove these values from the
  // secret entirely, and then remove these lines.
  delete secret.AWS_ACCESS_KEY_ID
  delete secret.AWS_SECRET_ACCESS_KEY
  delete secret.AWS_S3_KEY
  delete secret.AWS_S3_SECRET

  let dbUrl: string | undefined
  let dbName: string | undefined
  let dbUser: string | undefined
  let dbPassword: string | undefined
  let voterDbName: string | undefined
  let voterDbUser: string | undefined
  let voterDbPassword: string | undefined

  for (const [key, value] of Object.entries(secret)) {
    if (key === 'DATABASE_URL') {
      const { username, password, database } = extractDbCredentials(
        value as string,
      )
      dbUrl = value as string
      dbName = database
      dbUser = username
      dbPassword = password
    }
    if (key === 'VOTER_DATASTORE') {
      const { username, password, database } = extractDbCredentials(
        value as string,
      )
      voterDbName = database
      voterDbUser = username
      voterDbPassword = password
    }
  }

  if (!dbName || !dbUser || !dbPassword || !vpcCidr || !dbUrl) {
    throw new Error('DATABASE_URL, VPC_CIDR keys must be set in the secret.')
  }

  const dlq = new aws.sqs.Queue('main-dlq', {
    name: `${stage}-DLQ.fifo`,
    fifoQueue: true,
    messageRetentionSeconds: 7 * 24 * 60 * 60, // 7 days
  })

  const queue = new aws.sqs.Queue('main-queue', {
    name: `${stage}-Queue.fifo`,
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

  const tevynPollCsvsBucket = new aws.s3.Bucket('tevyn-poll-csvs-bucket', {
    bucket: `tevyn-poll-csvs-${stage}`,
    forceDestroy: false,
  })

  new aws.s3.BucketPublicAccessBlock('tevyn-poll-csvs-pab', {
    bucket: tevynPollCsvsBucket.id,
    blockPublicAcls: true,
    blockPublicPolicy: true,
    ignorePublicAcls: true,
    restrictPublicBuckets: true,
  })

  const zipToAreaCodeBucket = new aws.s3.Bucket('zip-to-area-code-bucket', {
    bucket: `zip-to-area-code-mappings-${stage}`,
    forceDestroy: false,
  })
  new aws.s3.BucketPublicAccessBlock('zip-to-area-code-mappings-pab', {
    bucket: zipToAreaCodeBucket.id,
    blockPublicAcls: true,
    blockPublicPolicy: true,
    ignorePublicAcls: true,
    restrictPublicBuckets: true,
  })

  if (stage === 'master') {
    const sqsSecurityGroup = new aws.ec2.SecurityGroup('sqs-sg', {
      vpcId,
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
      vpcId,
      serviceName: `com.amazonaws.us-west-2.sqs`,
      vpcEndpointType: 'Interface',
      subnetIds: ['subnet-053357b931f0524d4', 'subnet-0bb591861f72dcb7f'],
      securityGroupIds: [sqsSecurityGroup.id],
      privateDnsEnabled: true,
    })
  }

  // Assets bucket - used for storing uploaded files, images, etc.
  const assetsBucket = await createAssetsBucket({
    environment,
    stage,
  })

  if (environment !== 'prod') {
    await createAssetsRouter({
      environment: environment,
      bucketRegionalDomainName: assetsBucket.bucketRegionalDomainName,
      hostedZoneId,
    })
  }

  createService({
    environment,
    stage,
    vpcId,
    securityGroupIds: vpcSecurityGroupIds,
    publicSubnetIds: vpcSubnetIds.public,
    hostedZoneId,
    domain: select({
      dev: 'gp-api-dev.goodparty.org',
      qa: 'gp-api-qa.goodparty.org',
      prod: 'gp-api.goodparty.org',
    }),
    certificateArn: select({
      dev: 'arn:aws:acm:us-west-2:333022194791:certificate/227d8028-477a-4d75-999f-60587a8a11e3',
      qa: 'arn:aws:acm:us-west-2:333022194791:certificate/29de1de7-6ab0-4f62-baf1-235c2a92cfe2',
      prod: 'arn:aws:acm:us-west-2:333022194791:certificate/e1969507-2514-4585-a225-917883d8ffef',
    }),
    environmentVariables: {
      PORT: '80',
      HOST: '0.0.0.0',
      LOG_LEVEL: 'debug',
      CORS_ORIGIN: select({
        dev: 'dev.goodparty.org',
        qa: 'qa.goodparty.org',
        prod: 'goodparty.org',
      }),
      AWS_REGION: 'us-west-2',
      ASSET_DOMAIN: select({
        dev: 'https://assets-dev.goodparty.org',
        qa: 'https://assets-qa.goodparty.org',
        prod: 'https://assets.goodparty.org',
      }),
      WEBAPP_ROOT_URL: select({
        dev: 'https://dev.goodparty.org',
        qa: 'https://qa.goodparty.org',
        prod: 'https://goodparty.org',
      }),
      AI_MODELS:
        'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8,Qwen/Qwen3-235B-A22B-fp8-tput',
      LLAMA_AI_ASSISTANT: 'asst_GP_AI_1.0',
      SQS_QUEUE: queue.name,
      SQS_QUEUE_BASE_URL: 'https://sqs.us-west-2.amazonaws.com/333022194791',
      SERVE_ANALYSIS_BUCKET_NAME: select({
        dev: 'serve-analyze-data-dev',
        qa: 'serve-analyze-data-qa',
        prod: 'serve-analyze-data-prod',
      }),
      TEVYN_POLL_CSVS_BUCKET: tevynPollCsvsBucket.bucket,
      ZIP_TO_AREA_CODE_BUCKET: zipToAreaCodeBucket.bucket,
      ...secret,
    },
    permissions: [
      {
        Action: ['route53domains:List*', 'route53domains:Get*'],
        Resource: ['*'],
      },
      {
        Action: ['route53domains:CheckDomainAvailability'],
        Resource: ['*'],
      },
      {
        Action: ['s3:*', 's3-object-lambda:*'],
        Resource: ['*'],
      },
      {
        Action: ['sqs:*'],
        Resource: ['*'],
      },
      {
        Action: [
          'ssmmessages:OpenDataChannel',
          'ssmmessages:OpenControlChannel',
          'ssmmessages:CreateDataChannel',
          'ssmmessages:CreateControlChannel',
        ],
        Resource: ['*'],
      },
    ],
  })

  const rdsSecurityGroup = new aws.ec2.SecurityGroup('rdsSecurityGroup', {
    name:
      stage === 'develop'
        ? 'api-rds-security-group'
        : `api-${stage}-rds-security-group`,
    description: 'Allow traffic to RDS',
    vpcId,
    ingress: [
      // Allow access from Codebuild's security group
      {
        protocol: 'tcp',
        fromPort: 5432,
        toPort: 5432,
        securityGroups: ['sg-01de8d67b0f0ec787'], // Codebuild SG ID
      },
      {
        protocol: 'tcp',
        fromPort: 5432,
        toPort: 5432,
        cidrBlocks: [vpcCidr],
      },
    ].concat(
      select({
        // TODOSWAIN: investigate whether these are truly needed in dev
        dev: [
          {
            protocol: 'tcp',
            fromPort: 5432,
            toPort: 5432,
            description: 'internal gp-bastion',
            securityGroups: ['sg-05a21af11aacbe60b'],
          },
          {
            protocol: 'tcp',
            fromPort: 5432,
            toPort: 5432,
            description: 'databricks via vpc peering',
            cidrBlocks: ['172.16.0.0/16'],
          },
        ],
        qa: [],
        prod: [],
      }),
    ),
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
      stage === 'develop'
        ? 'api-rds-subnet-group'
        : `api-${stage}-rds-subnet-group`,
    subnetIds: ['subnet-053357b931f0524d4', 'subnet-0bb591861f72dcb7f'],
    tags: {
      Name: `api-${stage}-rds-subnet-group`,
    },
  })

  let rdsCluster: aws.rds.Cluster | undefined
  if (stage === 'master') {
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
      finalSnapshotIdentifier: `gp-api-db-${stage}-final-snapshot`,
      serverlessv2ScalingConfiguration: {
        maxCapacity: 64,
        minCapacity: stage === 'master' ? 1.0 : 0.5,
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
      finalSnapshotIdentifier: `gp-voter-db-${stage}-final-snapshot`,
      serverlessv2ScalingConfiguration: {
        maxCapacity: 128,
        minCapacity: 0.5,
      },
    }
    const voterCluster = new aws.rds.Cluster('voterCluster', voterDbProdConfig)

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
      finalSnapshotIdentifier: `gp-voter-db-${stage}-20250728-final-snapshot`,
    })

    new aws.rds.ClusterInstance('voterInstanceLatest', {
      clusterIdentifier: voterClusterLatest.id,
      instanceClass: 'db.serverless',
      engine: aws.rds.EngineType.AuroraPostgresql,
      engineVersion: voterClusterLatest.engineVersion,
    })
  } else if (stage === 'qa') {
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
      finalSnapshotIdentifier: `gp-api-db-${stage}-final-snapshot`,
      serverlessv2ScalingConfiguration: {
        maxCapacity: 64,
        minCapacity: 0.5,
      },
    })
  } else {
    rdsCluster = aws.rds.Cluster.get('rdsCluster', 'gp-api-db')

    const voterCluster = new aws.rds.Cluster('voterCluster', {
      clusterIdentifier: `gp-voter-db-${stage}`,
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
      finalSnapshotIdentifier: `gp-voter-db-${stage}-final-snapshot`,
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
  }

  new aws.rds.ClusterInstance('rdsInstance', {
    clusterIdentifier: rdsCluster.id,
    instanceClass: 'db.serverless',
    engine: aws.rds.EngineType.AuroraPostgresql,
    engineVersion: rdsCluster.engineVersion,
  })
}
