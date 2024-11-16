///  <reference types="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: 'GP-API',
      removal: input?.stage === 'production' ? 'retain' : 'remove',
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
      $app.stage === 'production'
        ? new sst.aws.Vpc('GP-VPC', {
            bastion: false,
            nat: 'managed',
            az: 2, // defaults to 2 availability zones and 2 NAT gateways
          })
        : sst.aws.Vpc.get('GP-VPC', 'vpc-057b988559836aa8d') // other stages will use GP-VPC

    // Each stage will get its own Cluster.
    const cluster = new sst.aws.Cluster('Fargate', { vpc })

    // Change the domain based on the stage.
    let domain = 'gp-api-test.goodparty.org'
    if ($app.stage === 'develop') {
      domain = 'gp-api-dev.goodparty.org'
    } else if ($app.stage === 'production') {
      domain = 'gp-api.goodparty.org'
    }

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
          $app.stage === 'production' ? 'goodparty.org' : 'dev.goodparty.org',
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
      // todo: configure health checks.
      image: {
        // context: "../", // Set the context to the main app directory
        // dockerfile: "deploy/Dockerfile",
        args: {
          // DOCKER_BUILDKIT: '1',
          DOCKER_USERNAME: process.env.DOCKER_USERNAME || '',
          DOCKER_PASSWORD: process.env.DOCKER_PASSWORD || '',
        },
      },
      dev: {
        command: 'node --watch main.js',
      },
    })
  },
})
