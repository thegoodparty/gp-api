///  <reference types="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: 'NestApp',
      removal: input?.stage === 'production' ? 'retain' : 'remove',
      home: 'aws',
    }
  },
  async run() {
    const vpc = new sst.aws.Vpc('NestVpc', {
      bastion: false,
      nat: 'managed',
      az: 2, // defaults to 2 availability zones and 2 NAT gateways
    })
    const cluster = new sst.aws.Cluster('NestCluster', { vpc })

    cluster.addService('NestService', {
      loadBalancer: {
        domain: 'gp-api.goodparty.org',
        ports: [
          { listen: '80/http' },
          { listen: '443/https', forward: '80/http' },
        ],
      },
      environment: {
        PORT: '80',
        HOST: '0.0.0.0',
      },
      // todo: use ssm for secrets.
      // ssm: {
      //   // Key-value pairs of AWS Systems Manager Parameter Store parameter ARNs or AWS Secrets
      //   //  * Manager secret ARNs. The values will be loaded into the container as environment variables.
      // },
      // todo: configure health checks.
      // health: {
      //   '443/https': {
      //     path: '/health',
      //     interval: '10 seconds',
      //   },
      // },
      image: {
        context: '../../gp-api', // Set the context to the main app directory
        dockerfile: 'Dockerfile',
      },
      dev: {
        command: 'node --watch main.js',
      },
    })
  },
})
