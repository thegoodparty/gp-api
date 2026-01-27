import * as pulumi from '@pulumi/pulumi'
import * as aws from '@pulumi/aws'
import { createService } from './components/service'
import { createAssetsBucket } from './components/assets-bucket'
import { createAssetsRouter } from './components/assets-router'
import { createVpc } from './components/vpc'

export = async () => {
  const config = new pulumi.Config()

  const environment = config.require('environment') as
    | 'preview'
    | 'dev'
    | 'qa'
    | 'prod'
  const imageUri = config.require('imageUri')

  const prNumber =
    environment === 'preview' ? config.require('prNumber') : undefined

  const vpcId = 'vpc-0763fa52c32ebcf6a'
  const vpcCidr = '10.0.0.0/16'
  const hostedZoneId = 'Z10392302OXMPNQLPO07K'

  const vpcSubnetIds = {
    public: ['subnet-07984b965dabfdedc', 'subnet-01c540e6428cdd8db'],
    private: ['subnet-053357b931f0524d4', 'subnet-0bb591861f72dcb7f'],
  }
  const vpcSecurityGroupIds = ['sg-01de8d67b0f0ec787']

  const stage = {
    preview: `pr-${prNumber}`,
    dev: 'develop',
    qa: 'qa',
    prod: 'master',
  }[environment]

  const select = <T>(values: Record<'preview' | 'dev' | 'qa' | 'prod', T>): T =>
    values[environment]

  // Production deploy manages the VPC. The actual VPC details are hard-coded above as individual variables.
  if (environment === 'prod') {
    createVpc()
  }

  const secretName = select({
    preview: 'GP_API_DEV',
    dev: 'GP_API_DEV',
    qa: 'GP_API_QA',
    prod: 'GP_API_PROD',
  })

  const secretVersion = await aws.secretsmanager.getSecretVersion({
    secretId: secretName,
  })

  const secretInfo = await aws.secretsmanager.getSecret({
    name: secretName,
  })

  const secret: Record<string, string> = JSON.parse(
    secretVersion.secretString || '{}',
  ) as Record<string, string>
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
  // DO NOT REMOVE THESE. These are here so that the secret values don't take precedence
  // over the environment variables set below.
  // Once this change has deployed to prod, we can remove these entries from the secret entirely.
  delete secret.LOG_LEVEL
  delete secret.CORS_ORIGIN
  delete secret.AWS_REGION
  delete secret.ASSET_DOMAIN
  delete secret.WEBAPP_ROOT_URL
  delete secret.AI_MODELS
  delete secret.LLAMA_AI_ASSISTANT
  delete secret.SQS_QUEUE
  delete secret.SQS_QUEUE_BASE_URL
  delete secret.SERVE_ANALYSIS_BUCKET_NAME
  delete secret.TEVYN_POLL_CSVS_BUCKET
  delete secret.ZIP_TO_AREA_CODE_BUCKET
  // DO NOT REMOVE THESE. These are here so that the secret values don't take precedence
  // over the connection strings constructed at runtime in docker-entrypoint.sh.
  // In AWS ECS, secrets take precedence over environment variables.
  delete secret.DATABASE_URL
  delete secret.VOTER_DATASTORE

  if (!secret.DB_PASSWORD) {
    throw new Error('DB_PASSWORD must be set in the secret.')
  }

  if (!secret.VOTER_DB_PASSWORD) {
    throw new Error('VOTER_DB_PASSWORD must be set in the secret.')
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
    redrivePolicy: pulumi.jsonStringify({
      deadLetterTargetArn: dlq.arn,
      maxReceiveCount: 3,
    }),
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

  if (environment === 'prod') {
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
      subnetIds: vpcSubnetIds.private,
      securityGroupIds: [sqsSecurityGroup.id],
      privateDnsEnabled: true,
    })
  }

  // Assets bucket - used for storing uploaded files, images, etc.
  if (environment !== 'preview') {
    const assetsBucket = createAssetsBucket({ environment })

    if (environment !== 'prod') {
      createAssetsRouter({
        environment,
        bucketRegionalDomainName: assetsBucket.bucketRegionalDomainName,
        hostedZoneId,
      })
    }
  }

  const rdsSecurityGroup = new aws.ec2.SecurityGroup('rdsSecurityGroup', {
    name:
      environment === 'dev'
        ? 'api-rds-security-group'
        : `api-${stage}-rds-security-group`,
    description: 'Allow traffic to RDS',
    vpcId,
    ingress: [
      {
        protocol: 'tcp',
        fromPort: 5432,
        toPort: 5432,
        securityGroups: vpcSecurityGroupIds,
      },
      {
        protocol: 'tcp',
        fromPort: 5432,
        toPort: 5432,
        cidrBlocks: [vpcCidr],
      },
    ].concat(
      select({
        preview: [],
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

  const subnetGroup = new aws.rds.SubnetGroup('subnetGroup', {
    name:
      environment === 'dev'
        ? 'api-rds-subnet-group'
        : `api-${stage}-rds-subnet-group`,
    subnetIds: vpcSubnetIds.private,
    tags: {
      Name: `api-${stage}-rds-subnet-group`,
    },
  })

  const rdsCluster = new aws.rds.Cluster('rdsCluster', {
    clusterIdentifier: select({
      preview: `gp-api-${stage}`,
      dev: 'gp-api-db',
      qa: 'gp-api-db-qa',
      prod: 'gp-api-db-prod',
    }),
    engine: aws.rds.EngineType.AuroraPostgresql,
    engineMode: aws.rds.EngineMode.Provisioned,
    engineVersion: '16.8',
    databaseName: 'gpdb',
    masterUsername: 'gpuser',
    masterPassword: pulumi.secret(secret.DB_PASSWORD),
    dbSubnetGroupName: subnetGroup.name,
    vpcSecurityGroupIds: [rdsSecurityGroup.id],
    storageEncrypted: true,
    serverlessv2ScalingConfiguration: {
      minCapacity: environment === 'prod' ? 1 : 0.5,
      maxCapacity: 64,
    },
    // Disable these protections for preview environments -- these
    // configs help them tear down more quickly.
    deletionProtection: environment !== 'preview',
    skipFinalSnapshot: environment === 'preview',
    finalSnapshotIdentifier:
      environment === 'preview'
        ? undefined
        : `gp-api-db-${stage}-final-snapshot`,
  })

  const rdsInstance = new aws.rds.ClusterInstance('rdsInstance', {
    clusterIdentifier: rdsCluster.id,
    instanceClass: 'db.serverless',
    engine: aws.rds.EngineType.AuroraPostgresql,
    engineVersion: rdsCluster.engineVersion,
  })

  let voterCluster: aws.rds.Cluster | aws.rds.GetClusterResult

  switch (environment) {
    case 'dev':
    case 'prod':
      const voterDbBaseConfig = {
        engine: aws.rds.EngineType.AuroraPostgresql,
        engineMode: aws.rds.EngineMode.Provisioned,
        engineVersion: '16.8',
        databaseName: 'voters',
        masterUsername: 'postgres',
        masterPassword: pulumi.secret(secret.VOTER_DB_PASSWORD),
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

      voterCluster = new aws.rds.Cluster('voterCluster', {
        ...voterDbBaseConfig,
        clusterIdentifier:
          environment === 'prod' ? 'gp-voter-db' : `gp-voter-db-${stage}`,
        finalSnapshotIdentifier: `gp-voter-db-${stage}-final-snapshot`,
      })

      new aws.rds.ClusterInstance('voterInstance', {
        clusterIdentifier: voterCluster.id,
        instanceClass: 'db.serverless',
        engine: aws.rds.EngineType.AuroraPostgresql,
        engineVersion: voterCluster.engineVersion,
      })

      if (environment === 'prod') {
        const voterClusterLatest = new aws.rds.Cluster('voterClusterLatest', {
          ...voterDbBaseConfig,
          clusterIdentifier: 'gp-voter-db-20250728',
          finalSnapshotIdentifier: `gp-voter-db-${stage}-20250728-final-snapshot`,
        })

        new aws.rds.ClusterInstance('voterInstanceLatest', {
          clusterIdentifier: voterClusterLatest.id,
          instanceClass: 'db.serverless',
          engine: aws.rds.EngineType.AuroraPostgresql,
          engineVersion: voterClusterLatest.engineVersion,
        })
      }
      break
    case 'preview':
      voterCluster = await aws.rds.getCluster({
        clusterIdentifier: 'gp-voter-db-develop',
      })
      break
    case 'qa':
      voterCluster = await aws.rds.getCluster({
        clusterIdentifier: 'gp-voter-db-20250728',
      })
      break
  }

  const productDomain = select({
    preview: 'dev.goodparty.org',
    dev: 'dev.goodparty.org',
    qa: 'qa.goodparty.org',
    prod: 'goodparty.org',
  })

  const service = createService({
    dependsOn: [rdsInstance],
    environment,
    stage,
    imageUri,
    vpcId,
    securityGroupIds: vpcSecurityGroupIds,
    publicSubnetIds: vpcSubnetIds.public,
    hostedZoneId,
    domain: select({
      preview: `${stage}.preview.goodparty.org`,
      dev: 'gp-api-dev.goodparty.org',
      qa: 'gp-api-qa.goodparty.org',
      prod: 'gp-api.goodparty.org',
    }),
    certificateArn: select({
      preview:
        'arn:aws:acm:us-west-2:333022194791:certificate/b009d1a6-68ff-4d24-84f7-93683ca3f786',
      dev: 'arn:aws:acm:us-west-2:333022194791:certificate/227d8028-477a-4d75-999f-60587a8a11e3',
      qa: 'arn:aws:acm:us-west-2:333022194791:certificate/29de1de7-6ab0-4f62-baf1-235c2a92cfe2',
      prod: 'arn:aws:acm:us-west-2:333022194791:certificate/e1969507-2514-4585-a225-917883d8ffef',
    }),
    secrets: Object.fromEntries(
      Object.keys(secret).map((key) => [
        key,
        pulumi.interpolate`${secretInfo.arn}:${key}::`,
      ]),
    ),
    environmentVariables: {
      PORT: '80',
      HOST: '0.0.0.0',
      LOG_LEVEL: 'debug',
      CORS_ORIGIN: productDomain,
      AWS_REGION: 'us-west-2',
      ASSET_DOMAIN: select({
        preview: 'assets-dev.goodparty.org',
        dev: 'assets-dev.goodparty.org',
        qa: 'assets-qa.goodparty.org',
        prod: 'assets.goodparty.org',
      }),
      WEBAPP_ROOT_URL: `https://${productDomain}`,
      AI_MODELS:
        'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8,Qwen/Qwen3-235B-A22B-fp8-tput',
      LLAMA_AI_ASSISTANT: 'asst_GP_AI_1.0',
      SQS_QUEUE: queue.name,
      SQS_QUEUE_BASE_URL: 'https://sqs.us-west-2.amazonaws.com/333022194791',
      SERVE_ANALYSIS_BUCKET_NAME: `serve-analyze-data-${environment}`,
      TEVYN_POLL_CSVS_BUCKET: tevynPollCsvsBucket.bucket,
      ZIP_TO_AREA_CODE_BUCKET: zipToAreaCodeBucket.bucket,
      DB_HOST: rdsCluster.endpoint,
      DB_USER: rdsCluster.masterUsername,
      DB_NAME: rdsCluster.databaseName,
      VOTER_DB_HOST: voterCluster.endpoint,
      VOTER_DB_USER: voterCluster.masterUsername,
      VOTER_DB_NAME: voterCluster.databaseName,
      ...(environment === 'preview'
        ? {
            IS_PREVIEW: 'true',
            ADMIN_EMAIL: process.env.ADMIN_EMAIL,
            ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
            CANDIDATE_EMAIL: process.env.CANDIDATE_EMAIL,
            CANDIDATE_PASSWORD: process.env.CANDIDATE_PASSWORD,
          }
        : {}),
    },
    permissions: [
      {
        Effect: 'Allow',
        Action: ['route53domains:List*', 'route53domains:Get*'],
        Resource: ['*'],
      },
      {
        Effect: 'Allow',
        Action: ['route53domains:CheckDomainAvailability'],
        Resource: ['*'],
      },
      {
        Effect: 'Allow',
        Action: ['s3:*', 's3-object-lambda:*'],
        Resource: ['*'],
      },
      {
        Effect: 'Allow',
        Action: ['sqs:*'],
        Resource: ['*'],
      },
      {
        Effect: 'Allow',
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

  return {
    serviceUrl: service.url,
  }
}
