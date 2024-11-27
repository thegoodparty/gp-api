///  <reference types="./.sst/platform/config.d.ts" />
// import * as aws from '@pulumi/aws'

export default $config({
  app(input) {
    return {
      name: 'gp',
      removal: input?.stage === 'master' ? 'retain' : 'remove',
      home: 'aws',
      providers: {
        aws: {
          region: 'us-west-2',
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
        : sst.aws.Vpc.get('api', 'vpc-0763fa52c32ebcf6a') // other stages will use GP-VPC

    // Each stage will get its own Cluster.
    const cluster = new sst.aws.Cluster('fargate', { vpc })

    // Change the domain based on the stage.
    let domain = 'gp-api-test.goodparty.org'
    if ($app.stage === 'develop') {
      domain = 'gp-api-dev.goodparty.org'
    } else if ($app.stage === 'master') {
      domain = 'gp-api.goodparty.org'
    }

    // const dbUrl = new sst.Secret('DBURL')
    cluster.addService(`gp-api-${$app.stage}`, {
      loadBalancer: {
        domain,
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
          // DATABASE_URL: dbUrl.value, // so we can run migrations.
          STAGE: $app.stage,
        },
      },
    })

    // this is the builtin sst aws postgres construct
    // to customize things like storage autoscaling, encryption, multi-az, etc
    // then we need to use the pulumi aws rds constructs.
    // todo: make main and dev share the same database ?

    // const database = new sst.aws.Postgres('rds', {
    //   vpc,
    //   database: 'gpdb',
    //   instance: 't3.small', // m7g.large is latest generation.
    //   storage: '100 GB',
    //   username: 'gpuser',
    //   version: '16.2', // 16.4 is the latest.
    //   // specifying vpc subnet not necessary because it will use the private subnet in the vpc by default.
    //   // vpc: { subenets: []}}
    //   // if we have connection pool issues, we can turn on rds proxy.
    //   // proxy: true
    // })

    // Could not get serverlessv2 with pulumi to work.
    // also could not specify the vpc or subnets.

    // const rdsCluster = new aws.rds.Cluster('rdsCluster', {
    //   clusterIdentifier: 'gp-api-db',
    //   engine: aws.rds.EngineType.AuroraPostgresql,
    //   engineMode: aws.rds.EngineMode.Provisioned,
    //   engineVersion: '16.2',
    //   databaseName: $app.stage === 'production' ? 'apiprod' : 'apidev',
    //   manageMasterUserPassword: false,
    //   masterUsername: process.env.DATABASE_USER || 'admin',
    //   masterPassword: process.env.DATABASE_PASSWORD || 'password',
    //   storageEncrypted: true,
    //   serverlessv2ScalingConfiguration: {
    //     maxCapacity: 1,
    //     minCapacity: 0.5,
    //   },
    // not sure how to get the vpc and subnets from the pulumi vpc construct.
    // dbSubnetGroupName: vpc.privateSubnets.get().values[0].dbSubnetGroupName,
    // vpcSecurityGroupIds:
    // })

    // const rdsInstance = new aws.rds.ClusterInstance('rdsInstance', {
    //   clusterIdentifier: rdsCluster.id,
    //   instanceClass: 'db.serverless',
    //   engine: aws.rds.EngineType.AuroraPostgresql,
    //   engineVersion: rdsCluster.engineVersion,
    // })
  },
  // deploy the runner into the vpc so it can access the database.
  console: {
    autodeploy: {
      // @ts-ignore
      runner: {
        // engine: 'codebuild',
        // timeout: '10 minutes',
        // architecture: 'x86_64',
        vpc: {
          id: 'vpc-0763fa52c32ebcf6a',
          subnets: ['subnet-053357b931f0524d4'],
          securityGroups: ['sg-01de8d67b0f0ec787'],
        },
      },
    },
  },
})
