import * as aws from '@pulumi/aws'
import * as awsx from '@pulumi/awsx'
import { output } from '@pulumi/pulumi'

export const ecsService = () => {
  const shortName = name.length > 20 ? name.substring(0, 20) : name

  const lb = new awsx.lb.ApplicationLoadBalancer(
    `${shortName}-alb`,
    {
      subnetIds: args.publicSubnetIds,
      securityGroups: [args.securityGroupId],
      defaultTargetGroup: {
        port: 80,
        protocol: 'HTTP',
        targetType: 'ip',
        deregistrationDelay: 5,
        healthCheck: {
          path: '/v1/health',
          interval: 10,
          timeout: 5,
          healthyThreshold: 2,
          unhealthyThreshold: 3,
          matcher: '200',
        },
      },
      listeners: [
        {
          port: 443,
          protocol: 'HTTPS',
          certificateArn: args.certificateArn,
        },
        {
          port: 80,
          protocol: 'HTTP',
          defaultActions: [
            {
              type: 'redirect',
              redirect: {
                protocol: 'HTTPS',
                port: '443',
                statusCode: 'HTTP_301',
              },
            },
          ],
        },
      ],
    },
    { parent: this },
  )

  const logGroup = new aws.cloudwatch.LogGroup(
    `${shortName}-logs`,
    {
      name: `/ecs/${name}`,
      retentionInDays: 60,
      tags: resourceTags,
    },
    { parent: this },
  )

  const taskRole = new aws.iam.Role(
    `${shortName}-task-role`,
    {
      assumeRolePolicy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: { Service: 'ecs-tasks.amazonaws.com' },
          },
        ],
      }),
      tags: resourceTags,
    },
    { parent: this },
  )

  new aws.iam.RolePolicy(
    `${shortName}-task-policy`,
    {
      role: taskRole.id,
      policy: pulumi
        .all([args.queueArn, args.s3BucketArns || []])
        .apply(([queueArn, s3Arns]) =>
          JSON.stringify({
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Action: [
                  'sqs:SendMessage',
                  'sqs:ReceiveMessage',
                  'sqs:DeleteMessage',
                  'sqs:GetQueueAttributes',
                  'sqs:GetQueueUrl',
                ],
                Resource: queueArn,
              },
              ...(s3Arns.length > 0
                ? [
                    {
                      Effect: 'Allow',
                      Action: [
                        's3:GetObject',
                        's3:PutObject',
                        's3:DeleteObject',
                        's3:ListBucket',
                      ],
                      Resource: s3Arns.flatMap((arn: string) => [
                        arn,
                        `${arn}/*`,
                      ]),
                    },
                  ]
                : []),
              {
                Effect: 'Allow',
                Action: [
                  'route53domains:Get*',
                  'route53domains:List*',
                  'route53domains:CheckDomainAvailability',
                ],
                Resource: '*',
              },
            ],
          }),
        ),
    },
    { parent: this },
  )

  const envVars = output(args.environment).apply((env) =>
    Object.entries(env).map(([name, value]) => ({ name, value })),
  )

  const cluster = new aws.ecs.Cluster(
    `${shortName}-cluster`,
    {
      name: '',
    },
    { parent: this },
  )

  const service = new awsx.ecs.FargateService(
    `${shortName}-svc`,
    {
      cluster: cluster.arn,
      propagateTags: 'SERVICE',
      healthCheckGracePeriodSeconds: 300,
      networkConfiguration: {
        subnets: args.publicSubnetIds,
        securityGroups: [args.taskSecurityGroup.id],
        assignPublicIp: true,
      },
      taskDefinitionArgs: {
        taskRole: { roleArn: taskRole.arn },
        container: {
          name: 'gp-api',
          image: args.imageUri,
          cpu: args.isProduction ? 1024 : 512,
          memory: args.isProduction ? 2048 : 1024,
          essential: true,
          portMappings: [{ containerPort: 80, hostPort: 80, protocol: 'tcp' }],
          environment: envVars,
          logConfiguration: {
            logDriver: 'awslogs',
            options: {
              'awslogs-group': logGroup.name,
              'awslogs-region': 'us-west-2',
              'awslogs-stream-prefix': 'ecs',
            },
          },
        },
      },
      loadBalancers: [
        {
          targetGroupArn: lb.defaultTargetGroup.arn,
          containerName: 'gp-api',
          containerPort: 80,
        },
      ],
      desiredCount: args.isProduction ? 2 : 1,
    },
    {
      parent: this,
      dependsOn: [logGroup, cluster],
      customTimeouts: {
        create: '30m',
        update: '30m',
      },
    },
  )

  const domainName = args.domain

  new aws.route53.Record(
    `${shortName}-dns`,
    {
      zoneId: args.hostedZoneId,
      name: domainName,
      type: 'A',
      aliases: [
        {
          name: lb.loadBalancer.dnsName,
          zoneId: lb.loadBalancer.zoneId,
          evaluateTargetHealth: true,
        },
      ],
    },
    { parent: this },
  )

  return {
    url: output(`https://${domainName}`),
    loadBalancerArnSuffix: lb.loadBalancer.arnSuffix,
    targetGroupArnSuffix: lb.defaultTargetGroup.arnSuffix,
    clusterArn: cluster.arn,
    serviceName: service.service.name,
    taskSecurityGroupId: args.taskSecurityGroup.id,
  }
}
