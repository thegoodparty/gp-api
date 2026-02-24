import * as aws from '@pulumi/aws'

export interface SnsTopicsConfig {
  environment: 'dev' | 'qa' | 'prod'
}

/**
 * Import and encrypt 6 ClickOps SNS topics that were created via console
 * without KMS encryption. After the first `pulumi up` successfully imports
 * these resources, remove the `import` option from each resource.
 */
export function createSnsTopics({ environment }: SnsTopicsConfig) {
  const select = <T>(values: Record<'dev' | 'qa' | 'prod', T>): T =>
    values[environment]

  // Engineer Agent Failures — one per environment (stale, clusters are empty)
  new aws.sns.Topic('engineer-agent-failures', {
    name: `engineer-agent-failures-${environment}`,
    kmsMasterKeyId: 'alias/aws/sns',
    tags: {
      Name: 'Engineer Agent Failures',
      Environment: environment,
      ManagedBy: 'Pulumi',
    },
  }, {
    import: select({
      dev: 'arn:aws:sns:us-west-2:333022194791:engineer-agent-failures-dev',
      qa: 'arn:aws:sns:us-west-2:333022194791:engineer-agent-failures-qa',
      prod: 'arn:aws:sns:us-west-2:333022194791:engineer-agent-failures-prod',
    }),
  })

  // The following 3 topics are account-wide (not per-env).
  // Only create them in the prod stack to avoid duplication.
  if (environment === 'prod') {
    new aws.sns.Topic('eb-notifications', {
      name: 'ElasticBeanstalkNotifications-tgpApi-tgpapiEnv-TgpApi-env',
      kmsMasterKeyId: 'alias/aws/sns',
      tags: {
        Name: 'ElasticBeanstalk Notifications',
        ManagedBy: 'Pulumi',
      },
    }, {
      import: 'arn:aws:sns:us-west-2:333022194791:ElasticBeanstalkNotifications-tgpApi-tgpapiEnv-TgpApi-env',
    })

    new aws.sns.Topic('gp-prod-sns', {
      name: 'GP-Prod-SNS',
      kmsMasterKeyId: 'alias/aws/sns',
      tags: {
        Name: 'GP Prod SNS',
        ManagedBy: 'Pulumi',
      },
    }, {
      import: 'arn:aws:sns:us-west-2:333022194791:GP-Prod-SNS',
    })

    new aws.sns.Topic('sms-quickstart', {
      name: 'SmsQuickStartSnsDestination-cd888cc6',
      kmsMasterKeyId: 'alias/aws/sns',
      tags: {
        Name: 'SMS QuickStart Destination',
        ManagedBy: 'Pulumi',
      },
    }, {
      import: 'arn:aws:sns:us-west-2:333022194791:SmsQuickStartSnsDestination-cd888cc6',
    })
  }
}
