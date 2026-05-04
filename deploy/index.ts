import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'
import { createAssetsBucket } from './components/assets-bucket'
import { createAssetsRouter } from './components/assets-router'
import { createGrafanaResources } from './components/grafana'
import { createService } from './components/service'
import { createVpc } from './components/vpc'

export = async () => {
  const config = new pulumi.Config()

  // Pulumi config returns string — narrowing to known environment literals, validated by select() usage
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

  // JSON.parse returns any — AWS secret is always a string-keyed object, validated by key checks below
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const secret: Record<string, string> = JSON.parse(
    secretVersion.secretString || '{}',
  ) as Record<string, string>

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
    forceDestroy: environment === 'preview',
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
    forceDestroy: environment === 'preview',
  })
  new aws.s3.BucketPublicAccessBlock('zip-to-area-code-mappings-pab', {
    bucket: zipToAreaCodeBucket.id,
    blockPublicAcls: true,
    blockPublicPolicy: true,
    ignorePublicAcls: true,
    restrictPublicBuckets: true,
  })

  // Assets bucket - used for storing uploaded files, images, etc.
  if (environment !== 'preview') {
    const assetsBucket = createAssetsBucket({ environment })

    createAssetsRouter({
      environment,
      bucket: assetsBucket.bucket,
      bucketRegionalDomainName: assetsBucket.bucketRegionalDomainName,
      hostedZoneId,
    })
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
      {
        protocol: 'tcp',
        fromPort: 5432,
        toPort: 5432,
        description: 'databricks via vpc peering',
        cidrBlocks: ['172.16.0.0/16'],
      },
      ...select({
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
        ],
        qa: [],
        prod: [],
      }),
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
    backupRetentionPeriod: select({ preview: 1, dev: 7, qa: 7, prod: 14 }),
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
        backupRetentionPeriod: environment === 'prod' ? 14 : 7,
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
        voterCluster = voterClusterLatest

        voterCluster = await aws.rds.getCluster({
          clusterIdentifier: 'gp-voter-db-20260420',
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
        clusterIdentifier: 'gp-voter-db-20260420',
      })
      break
  }

  const productDomain = select({
    preview: 'dev.goodparty.org',
    dev: 'dev.goodparty.org',
    qa: 'qa.goodparty.org',
    prod: 'goodparty.org',
  })

  const domain = select({
    preview: `${stage}.preview.goodparty.org`,
    dev: 'gp-api-dev.goodparty.org',
    qa: 'gp-api-qa.goodparty.org',
    prod: 'gp-api.goodparty.org',
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
    domain,
    certificateArn: select({
      preview:
        'arn:aws:acm:us-west-2:333022194791:certificate/b009d1a6-68ff-4d24-84f7-93683ca3f786',
      dev: 'arn:aws:acm:us-west-2:333022194791:certificate/227d8028-477a-4d75-999f-60587a8a11e3',
      qa: 'arn:aws:acm:us-west-2:333022194791:certificate/29de1de7-6ab0-4f62-baf1-235c2a92cfe2',
      prod: 'arn:aws:acm:us-west-2:333022194791:certificate/e1969507-2514-4585-a225-917883d8ffef',
    }),
    secrets: {
      ...Object.fromEntries(
        Object.keys(secret).map((key) => [
          key,
          pulumi.interpolate`${secretInfo.arn}:${key}::`,
        ]),
      ),
      // Inngest POC: only wired up in dev. Preview is ephemeral and doesn't
      // need POC credentials; qa/prod wait for env-specific SSM parameters.
      ...select<Record<string, string>>({
        preview: {},
        dev: {
          INNGEST_EVENT_KEY:
            'arn:aws:ssm:us-west-2:333022194791:parameter/swain-inngest-poc-event-key',
          INNGEST_SIGNING_KEY:
            'arn:aws:ssm:us-west-2:333022194791:parameter/swain-inngest-poc-signing-key',
        },
        qa: {},
        prod: {},
      }),
    },
    environmentVariables: {
      PORT: '80',
      HOST: '0.0.0.0',
      LOG_LEVEL: 'debug',
      OTEL_SERVICE_ENVIRONMENT: environment,
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
        'Qwen/Qwen3-235B-A22B-Instruct-2507-tput,MiniMaxAI/MiniMax-M2.5',
      LLAMA_AI_ASSISTANT: 'asst_GP_AI_1.0',
      SQS_QUEUE: queue.name,
      SQS_QUEUE_BASE_URL: 'https://sqs.us-west-2.amazonaws.com/333022194791',
      CAMPAIGN_PLAN_INPUT_QUEUE_URL: select({
        preview: '',
        dev: 'https://sqs.us-west-2.amazonaws.com/333022194791/campaign-plan-input-dev.fifo',
        qa: 'https://sqs.us-west-2.amazonaws.com/333022194791/campaign-plan-input-qa.fifo',
        // prod disabled until we're ready to generate events in prod
        // prod: 'https://sqs.us-west-2.amazonaws.com/333022194791/campaign-plan-input-prod.fifo',
        prod: '',
      }),
      CAMPAIGN_PLAN_RESULTS_BUCKET: select({
        preview: '',
        dev: 'campaign-plan-results-dev',
        qa: 'campaign-plan-results-qa',
        // prod disabled until we're ready to generate events in prod
        // prod: 'campaign-plan-results-prod',
        prod: '',
      }),
      AGENT_DISPATCH_QUEUE_NAME: select({
        // Preview intentionally omitted — dispatch fails at runtime with a log
        preview: '',
        dev: 'agent-dispatch-dev.fifo',
        qa: 'agent-dispatch-qa.fifo',
        prod: 'agent-dispatch-prod.fifo',
      }),
      SERVE_ANALYSIS_BUCKET_NAME: `serve-analyze-data-${environment === 'preview' ? 'dev' : environment}`,
      MEETING_PIPELINE_BUCKET: 'meeting-pipeline-dev',
      TEVYN_POLL_CSVS_BUCKET: tevynPollCsvsBucket.bucket,
      ZIP_TO_AREA_CODE_BUCKET: zipToAreaCodeBucket.bucket,
      DB_HOST: rdsCluster.endpoint,
      DB_USER: rdsCluster.masterUsername,
      DB_NAME: rdsCluster.databaseName,
      VOTER_DB_HOST: voterCluster.endpoint,
      VOTER_DB_USER: voterCluster.masterUsername,
      VOTER_DB_NAME: voterCluster.databaseName,
      SECRET_NAMES: Object.keys(secret).join(','),
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

  if (environment !== 'preview') {
    await createGrafanaResources({ environment, domain })
  }

  return {
    serviceUrl: service.url,
  }
}
