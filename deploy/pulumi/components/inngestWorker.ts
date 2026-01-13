import * as pulumi from '@pulumi/pulumi'
import * as awsx from '@pulumi/awsx'
import * as aws from '@pulumi/aws'

export interface InngestWorkerArgs {
  vpcId: pulumi.Input<string>
  publicSubnetIds: pulumi.Input<string[]>
  privateSubnetIds: pulumi.Input<string[]>
  taskSecurityGroup: aws.ec2.SecurityGroup
  imageUri: pulumi.Input<string>
  isProduction: boolean
  isPreview: boolean
  prNumber?: string
  environment: pulumi.Input<Record<string, pulumi.Input<string>>>
  queueArn: pulumi.Input<string>
  s3BucketArns?: pulumi.Input<string[]>
  tags?: Record<string, string>
}

export class InngestWorker extends pulumi.ComponentResource {
  public readonly serviceName: pulumi.Output<string>
  public readonly clusterArn: pulumi.Output<string>

  constructor(
    name: string,
    args: InngestWorkerArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super('gp:inngest:Worker', name, {}, opts)

    const shortName = name.length > 20 ? name.substring(0, 20) : name

    const baseTags = args.tags || {}
    const resourceTags = args.isPreview
      ? { ...baseTags, Environment: 'preview', PR: args.prNumber || 'unknown' }
      : {
          ...baseTags,
          Environment: args.isProduction ? 'Production' : 'Development',
        }

    // CloudWatch Log Group
    const logGroup = new aws.cloudwatch.LogGroup(
      `${shortName}-worker-logs`,
      {
        name: `/ecs/${name}-worker`,
        retentionInDays: 60,
        tags: resourceTags,
      },
      { parent: this },
    )

    // Task Role (same permissions as API)
    const taskRole = new aws.iam.Role(
      `${shortName}-worker-role`,
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

    // Task Policy
    new aws.iam.RolePolicy(
      `${shortName}-worker-policy`,
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

    // Environment variables with Inngest-specific config
    const envVars = pulumi.output(args.environment).apply((env) => {
      const workerEnv = {
        ...env,
        WORKER_PORT: '3002',
        // Inngest worker doesn't need to send events, only receive
        // No INNGEST_EVENT_KEY needed
      }
      return Object.entries(workerEnv).map(([name, value]) => ({ name, value }))
    })

    // ECS Cluster (create new cluster for worker)
    const cluster = new aws.ecs.Cluster(
      `${shortName}-worker-cluster`,
      {
        tags: resourceTags,
      },
      { parent: this },
    )

    // Fargate Service
    const service = new awsx.ecs.FargateService(
      `${shortName}-worker-svc`,
      {
        cluster: cluster.arn,
        tags: resourceTags,
        propagateTags: 'SERVICE',
        networkConfiguration: {
          subnets: args.publicSubnetIds,
          securityGroups: [args.taskSecurityGroup.id],
          assignPublicIp: true,
        },
        taskDefinitionArgs: {
          taskRole: { roleArn: taskRole.arn },
          tags: resourceTags,
          container: {
            name: 'gp-inngest-worker',
            image: args.imageUri,
            cpu: args.isProduction ? 512 : 256,
            memory: args.isProduction ? 1024 : 512,
            essential: true,
            portMappings: [
              { containerPort: 3002, hostPort: 3002, protocol: 'tcp' },
            ],
            environment: envVars,
            command: ['npm', 'run', 'worker:start'],
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
        desiredCount: args.isProduction ? 2 : 1,
      },
      {
        parent: this,
        dependsOn: [logGroup, cluster],
      },
    )

    // Auto-scaling for production
    if (args.isProduction) {
      const scalingTarget = new aws.appautoscaling.Target(
        `${shortName}-worker-scaling`,
        {
          maxCapacity: 5,
          minCapacity: 2,
          resourceId: pulumi.interpolate`service/${cluster.name}/${service.service.name}`,
          scalableDimension: 'ecs:service:DesiredCount',
          serviceNamespace: 'ecs',
        },
        { parent: this, dependsOn: [service] },
      )

      new aws.appautoscaling.Policy(
        `${shortName}-worker-cpu-scaling`,
        {
          policyType: 'TargetTrackingScaling',
          resourceId: scalingTarget.resourceId,
          scalableDimension: scalingTarget.scalableDimension,
          serviceNamespace: scalingTarget.serviceNamespace,
          targetTrackingScalingPolicyConfiguration: {
            predefinedMetricSpecification: {
              predefinedMetricType: 'ECSServiceAverageCPUUtilization',
            },
            targetValue: 70,
            scaleInCooldown: 300,
            scaleOutCooldown: 60,
          },
        },
        { parent: this },
      )
    }

    this.serviceName = service.service.name
    this.clusterArn = cluster.arn
  }
}
