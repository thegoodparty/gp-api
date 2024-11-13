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
        ports: [{ listen: '80/http' }],
      },
      environment: {
        PORT: '80',
        HOST: '0.0.0.0',
      },
      image: {
        context: '../../gp-api', // Set the context to the main app directory
        dockerfile: 'Dockerfile', // Dockerfile in the main app directory
      },
      dev: {
        command: 'node --watch main.js',
      },
    })
  },
})
