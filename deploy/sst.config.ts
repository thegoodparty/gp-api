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
    const vpc = new sst.aws.Vpc('NestVpc', { bastion: false })
    const cluster = new sst.aws.Cluster('NestCluster', { vpc })

    cluster.addService('NestService', {
      loadBalancer: {
        domain: 'nest.goodparty.org',
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
