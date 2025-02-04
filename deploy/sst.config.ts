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
    if ($app.stage === 'master') {
      apiDomain = 'gp-api.goodparty.org'
      bucketDomain = 'assets.goodparty.org'
    } else if ($app.stage === 'develop') {
      apiDomain = 'gp-api-dev.goodparty.org'
      bucketDomain = 'assets-dev.goodparty.org'
    } else {
      apiDomain = `gp-api-${$app.stage}.goodparty.org`
      bucketDomain = `assets-${$app.stage}.goodparty.org`
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

    // todo: codebuild projects for each stage.
    // Note: our buildspec is only created when deploy is run since its part of the sst deploy process.
    // so for any changes to the buildspec, we need to run deploy before running the codebuild project.
    const codeBuildProject = new aws.codebuild.Project('gp-deploy-build', {
      name: `gp-deploy-build-${$app.stage}`,
      serviceRole: codeBuildRole.arn,
      environment: {
        computeType: 'BUILD_GENERAL1_LARGE',
        image: 'aws/codebuild/standard:6.0',
        type: 'LINUX_CONTAINER',
        privilegedMode: true,
      },
      vpcConfig: {
        vpcId: 'vpc-0763fa52c32ebcf6a',
        subnets: ['subnet-053357b931f0524d4', 'subnet-0bb591861f72dcb7f'],
        securityGroupIds: ['sg-01de8d67b0f0ec787'],
      },
      source: {
        type: 'GITHUB',
        location: 'https://github.com/thegoodparty/gp-api.git',
        buildspec: pulumi.interpolate`        
version: 0.2
phases:
  install:
    runtime-versions:
      nodejs: 22
    commands:
      - npm install -g sst

  pre_build:
    commands:
      - echo "Moving into deploy folder..."
      - cd deploy
      - echo "Installing local dependencies..."
      - npm ci || npm install

  build:
    commands:
      - echo "Deploying SST app. stage: ${$app.stage}"
      - sst deploy --stage=${$app.stage || 'develop'} --verbose --print-logs
      - echo "Waiting for ECS to be stable..."
      - aws ecs wait services-stable --cluster arn:aws:ecs:us-west-2:333022194791:cluster/gp-${$app.stage}-fargateCluster --services gp-api-${$app.stage}
      - echo "Done!"
`,
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
