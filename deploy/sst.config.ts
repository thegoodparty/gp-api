///  <reference types="./.sst/platform/config.d.ts" />
import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'

export default $config({
  app(input) {
    return {
      name: 'gp',
      removal: input?.stage === 'master' ? 'retain' : 'remove',
      home: 'aws',
      providers: {
        aws: {
          region: 'us-west-2',
          version: '6.67.0',
        },
      },
    }
  },
  async run() {
    const vpc =
      $app.stage === 'master'
        ? new sst.aws.Vpc('api', {
            bastion: false,
            nat: 'managed',
            az: 2, // defaults to 2 availability zones and 2 NAT gateways
          })
        : sst.aws.Vpc.get('api', 'vpc-0763fa52c32ebcf6a') // other stages will use same vpc.

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
      webAppRootUrl = 'https://app-dev.goodparty.org'
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
      // chore: re-deploy.
      new sst.aws.Router(`assets-${$app.stage}`, {
        routes: {
          '/*': {
            bucket: assetsBucket,
          },
        },
        domain: bucketDomain,
      })
    }

    // Each stage will get its own Cluster.
    const cluster = new sst.aws.Cluster('fargate', { vpc })

    const dbUrl = new sst.Secret('DBURL')
    const dbName = new sst.Secret('DBNAME')
    const dbUser = new sst.Secret('DBUSER')
    const dbPassword = new sst.Secret('DBPASSWORD')
    const dbIps = new sst.Secret('DBIPS')

    if (
      !dbName.value ||
      !dbUser.value ||
      !dbPassword.value ||
      !dbIps.value ||
      !dbUrl.value
    ) {
      throw new Error(
        'DBNAME, DBUSER, DBPASSWORD, DBURL, DBIPS secrets must be set.',
      )
    }

    let enableFullstory = false
    if ($app.stage === 'master') {
      enableFullstory = true
    }

    let sqsQueueName = 'DEV_GP_Queue.fifo'
    if ($app.stage === 'master') {
      sqsQueueName = 'PROD_GP_Queue.fifo'
    } else if ($app.stage === 'qa') {
      sqsQueueName = 'QA_GP_Queue.fifo'
    }

    cluster.addService(`gp-api-${$app.stage}`, {
      loadBalancer: {
        domain: apiDomain,
        ports: [
          { listen: '80/http' },
          { listen: '443/https', forward: '80/http' },
          // { listen: '3000/http' },
          // { listen: '443/https', forward: '3000/http' },
        ],
        health: {
          '80/http': {
            path: '/v1/health',
            interval: '30 seconds',
          },
        },
      },
      memory: '0.5 GB',
      cpu: '0.25 vCPU',
      scaling: {
        min: $app.stage === 'master' ? 2 : 1,
        max: 16,
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
        ENABLE_FULLSTORY: enableFullstory ? 'true' : 'false',
        ASSET_DOMAIN: bucketDomain,
        WEBAPP_ROOT_URL: webAppRootUrl,
        AI_MODELS:
          'meta-llama/Llama-3.3-70B-Instruct-Turbo,Qwen/Qwen2.5-72B-Instruct-Turbo',
        LLAMA_AI_ASSISTANT: 'asst_GP_AI_1.0',
        SQS_QUEUE: sqsQueueName,
        SQS_QUEUE_BASE_URL: 'https://sqs.us-west-2.amazonaws.com/333022194791',
      },
      ssm: {
        // Key-value pairs of AWS Systems Manager Parameter Store parameter ARNs or AWS Secrets
        //  * Manager secret ARNs. The values will be loaded into the container as environment variables.
        CONTENTFUL_ACCESS_TOKEN:
          'arn:aws:secretsmanager:us-west-2:333022194791:secret:CONTENTFUL_ACCESS_TOKEN-1bABvs',
        CONTENTFUL_SPACE_ID:
          'arn:aws:secretsmanager:us-west-2:333022194791:secret:CONTENTFUL_SPACE_ID-BvsxFz',
        // todo: secrets for more stages.
        DATABASE_URL:
          'arn:aws:secretsmanager:us-west-2:333022194791:secret:DATABASE_URL-SqMsak',
        AUTH_SECRET:
          'arn:aws:secretsmanager:us-west-2:333022194791:secret:AUTH_SECRET-eGe66U',
        VOTER_DATASTORE:
          'arn:aws:secretsmanager:us-west-2:333022194791:secret:VOTER_DATASTORE-ooHetK',
        AWS_ACCESS_KEY_ID:
          'arn:aws:secretsmanager:us-west-2:333022194791:secret:AWS_ACCESS_KEY_ID-PWb1SB',
        AWS_SECRET_ACCESS_KEY:
          'arn:aws:secretsmanager:us-west-2:333022194791:secret:AWS_SECRET_ACCESS_KEY-nkThRE',
        AWS_S3_KEY:
          'arn:aws:secretsmanager:us-west-2:333022194791:secret:AWS_S3_KEY-YFEbWy',
        AWS_S3_SECRET:
          'arn:aws:secretsmanager:us-west-2:333022194791:secret:AWS_S3_SECRET-KW7BQX',
        HUBSPOT_TOKEN:
          'arn:aws:secretsmanager:us-west-2:333022194791:secret:HUBSPOT_TOKEN-gFRvGT',
        ASHBY_KEY:
          'arn:aws:secretsmanager:us-west-2:333022194791:secret:ASHBY_KEY-5UdDjD',
        FULLSTORY_API_KEY:
          'arn:aws:secretsmanager:us-west-2:333022194791:secret:FULLSTORY_API_KEY-Geho4f',
        MAILGUN_API_KEY:
          'arn:aws:secretsmanager:us-west-2:333022194791:secret:MAILGUN_API_KEY-718eny',
        TOGETHER_AI_KEY:
          'arn:aws:secretsmanager:us-west-2:333022194791:secret:TOGETHER_AI_KEY-sdX206',
        OPEN_AI_KEY:
          'arn:aws:secretsmanager:us-west-2:333022194791:secret:OPEN_AI_KEY-VGhQ4h',
        GOOGLE_CLIENT_ID:
          'arn:aws:secretsmanager:us-west-2:333022194791:secret:GOOGLE_CLIENT_ID-FcpHmK',
        GOOGLE_API_KEY:
          'arn:aws:secretsmanager:us-west-2:333022194791:secret:GOOGLE_API_KEY-dMkjI2',
        STRIPE_SECRET_KEY:
          'arn:aws:secretsmanager:us-west-2:333022194791:secret:STRIPE_SECRET_KEY-GSGinp',
        STRIPE_WEBSOCKET_SECRET:
          'arn:aws:secretsmanager:us-west-2:333022194791:secret:STRIPE_WEBSOCKET_SECRET-QT7A0C',
        BALLOT_READY_KEY:
          'arn:aws:secretsmanager:us-west-2:333022194791:secret:BALLOT_READY_KEY-c5SoNE',
        SLACK_APP_ID:
          'arn:aws:secretsmanager:us-west-2:333022194791:secret:SLACK_APP_ID-gCZdTR',
        SLACK_BOT_DEV_CHANNEL_ID:
          'arn:aws:secretsmanager:us-west-2:333022194791:secret:SLACK_BOT_DEV_CHANNEL_ID-c6kd0u',
        SLACK_BOT_DEV_CHANNEL_TOKEN:
          'arn:aws:secretsmanager:us-west-2:333022194791:secret:SLACK_BOT_DEV_CHANNEL_TOKEN-6GHsy8',
        SLACK_BOT_PATH_TO_VICTORY_CHANNEL_ID:
          'arn:aws:secretsmanager:us-west-2:333022194791:secret:SLACK_BOT_PATH_TO_VICTORY_CHANNEL_ID-cvLCRc',
        SLACK_BOT_PATH_TO_VICTORY_CHANNEL_TOKEN:
          'arn:aws:secretsmanager:us-west-2:333022194791:secret:SLACK_BOT_PATH_TO_VICTORY_CHANNEL_TOKEN-x3OTUF',
        SLACK_BOT_PATH_TO_VICTORY_ISSUES_CHANNEL_ID:
          'arn:aws:secretsmanager:us-west-2:333022194791:secret:SLACK_BOT_PATH_TO_VICTORY_ISSUES_CHANNEL_ID-Vf4jfd',
        SLACK_BOT_PATH_TO_VICTORY_ISSUES_CHANNEL_TOKEN:
          'arn:aws:secretsmanager:us-west-2:333022194791:secret:SLACK_BOT_PATH_TO_VICTORY_ISSUES_CHANNEL_TOKEN-ZYaTMY',
        SLACK_USER_FEEDBACK_CHANNEL_ID:
          'arn:aws:secretsmanager:us-west-2:333022194791:secret:SLACK_USER_FEEDBACK_CHANNEL_ID-qNgKov',
        SLACK_USER_FEEDBACK_CHANNEL_TOKEN:
          'arn:aws:secretsmanager:us-west-2:333022194791:secret:SLACK_USER_FEEDBACK_CHANNEL_TOKEN-DVapEH',
        SLACK_BOT_AI_CHANNEL_ID:
          'arn:aws:secretsmanager:us-west-2:333022194791:secret:SLACK_BOT_AI_CHANNEL_ID-0m7pMg',
        SLACK_BOT_AI_CHANNEL_TOKEN:
          'arn:aws:secretsmanager:us-west-2:333022194791:secret:SLACK_BOT_AI_CHANNEL_TOKEN-4dnzsC',
        SLACK_BOT_POLITICS_CHANNEL_ID:
          'arn:aws:secretsmanager:us-west-2:333022194791:secret:SLACK_BOT_POLITICS_CHANNEL_ID-Wq9jYg',
        SLACK_BOT_POLITICS_CHANNEL_TOKEN:
          'arn:aws:secretsmanager:us-west-2:333022194791:secret:SLACK_BOT_POLITICS_CHANNEL_TOKEN-FUVDcL',
        SLACK_BOT_FEEDBACK_CHANNEL_ID:
          'arn:aws:secretsmanager:us-west-2:333022194791:secret:SLACK_BOT_FEEDBACK_CHANNEL_ID-pETcUU',
        SLACK_BOT_FEEDBACK_CHANNEL_TOKEN:
          'arn:aws:secretsmanager:us-west-2:333022194791:secret:SLACK_BOT_FEEDBACK_CHANNEL_TOKEN-a7nvdu',
      },
      image: {
        context: '../', // Set the context to the main app directory
        dockerfile: './Dockerfile',
        args: {
          DOCKER_BUILDKIT: '1',
          CACHEBUST: '1',
          DOCKER_USERNAME: process.env.DOCKER_USERNAME || '',
          DOCKER_PASSWORD: process.env.DOCKER_PASSWORD || '',
          DATABASE_URL: dbUrl.value, // so we can run migrations.
          STAGE: $app.stage,
        },
      },
      link: [assetsBucket],
    })

    // Create a Security Group for the RDS Cluster
    const rdsSecurityGroup = new aws.ec2.SecurityGroup('rdsSecurityGroup', {
      name: 'api-rds-security-group',
      description: 'Allow traffic to RDS',
      vpcId: 'vpc-0763fa52c32ebcf6a',
      ingress: [
        {
          protocol: 'tcp',
          fromPort: 5432,
          toPort: 5432,
          cidrBlocks: [dbIps.value],
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

    // Create a Subnet Group for the RDS Cluster
    const subnetGroup = new aws.rds.SubnetGroup('subnetGroup', {
      name: 'api-rds-subnet-group',
      subnetIds: ['subnet-053357b931f0524d4', 'subnet-0bb591861f72dcb7f'],
      tags: {
        Name: 'api-rds-subnet-group',
      },
    })

    const rdsCluster = new aws.rds.Cluster('rdsCluster', {
      clusterIdentifier: 'gp-api-db',
      engine: aws.rds.EngineType.AuroraPostgresql,
      engineMode: aws.rds.EngineMode.Provisioned,
      engineVersion: '16.2',
      databaseName: dbName.value,
      // manageMasterUserPassword: true,
      masterUsername: dbUser.value || '',
      masterPassword: dbPassword.value || '',
      dbSubnetGroupName: subnetGroup.name,
      vpcSecurityGroupIds: [rdsSecurityGroup.id],
      storageEncrypted: true,
      serverlessv2ScalingConfiguration: {
        maxCapacity: 64,
        minCapacity: 0.5,
      },
    })

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
    const codeBuildProject = new aws.codebuild.Project('gp-deploy-build', {
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
    const actionsPolicy = new aws.iam.Policy('github-actions-policy', {
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
            Resource: pulumi.interpolate`${codeBuildProject.arn}`,
          },
          {
            Effect: 'Allow',
            Action: ['codebuild:ListProjects'],
            Resource: '*',
          },
          {
            Effect: 'Allow',
            Action: ['logs:GetLogEvents', 'logs:FilterLogEvents'],
            Resource: pulumi.interpolate`arn:aws:logs:us-west-2:333022194791:log-group:/aws/codebuild/${codeBuildProject.name}:*`,
          },
        ],
      }),
    })
  },
  // we no longer use autodeploy. we use codebuild.
  // console: {
  //   autodeploy: {
  //     runner: {
  //       engine: 'codebuild',
  //       timeout: '10 minutes',
  //       architecture: 'x86_64',
  //       vpc: {
  //         id: 'vpc-0763fa52c32ebcf6a',
  //         subnets: ['subnet-053357b931f0524d4', 'subnet-0bb591861f72dcb7f'],
  //         securityGroups: ['sg-01de8d67b0f0ec787'],
  //       },
  //     },
  //   },
  // },
})
