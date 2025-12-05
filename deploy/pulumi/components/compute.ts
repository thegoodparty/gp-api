import * as pulumi from '@pulumi/pulumi';
import * as awsx from '@pulumi/awsx';
import * as aws from '@pulumi/aws';

export interface ComputeArgs {
  vpcId: pulumi.Input<string>;
  publicSubnetIds: pulumi.Input<string[]>;
  securityGroupId: pulumi.Input<string>;
  taskSecurityGroup: aws.ec2.SecurityGroup;
  imageUri: pulumi.Input<string>;
  isProduction: boolean;
  isPreview: boolean;
  prNumber?: string;
  certificateArn: pulumi.Input<string>;
  environment: pulumi.Input<Record<string, pulumi.Input<string>>>;
  queueArn: pulumi.Input<string>;
  s3BucketArns?: pulumi.Input<string[]>;
  tags?: Record<string, string>;
  hostedZoneId?: pulumi.Input<string>;
  domain?: string;
}

export class Compute extends pulumi.ComponentResource {
  public readonly url: pulumi.Output<string>;
  public readonly loadBalancerArnSuffix: pulumi.Output<string>;
  public readonly targetGroupArnSuffix: pulumi.Output<string>;
  public readonly clusterArn: pulumi.Output<string>;
  public readonly serviceName: pulumi.Output<string>;
  public readonly taskSecurityGroupId: pulumi.Output<string>;

  constructor(
    name: string,
    args: ComputeArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super('gp:compute:Compute', name, {}, opts);

    const shortName = name.length > 20 ? name.substring(0, 20) : name;

    const baseTags = args.tags || {};
    const resourceTags = args.isPreview 
      ? { ...baseTags, Environment: 'preview', PR: args.prNumber || 'unknown' }
      : { ...baseTags, Environment: args.isProduction ? 'Production' : 'Development' };

    const lb = new awsx.lb.ApplicationLoadBalancer(
      `${shortName}-alb`,
      {
        subnetIds: args.publicSubnetIds,
        securityGroups: [args.securityGroupId],
        tags: resourceTags,
        defaultTargetGroup: {
          port: 80,
          protocol: 'HTTP',
          targetType: 'ip',
          deregistrationDelay: 5,
          tags: resourceTags,
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
            tags: resourceTags,
          },
          {
            port: 80,
            protocol: 'HTTP',
            tags: resourceTags,
            defaultActions: [{
              type: 'redirect',
              redirect: {
                protocol: 'HTTPS',
                port: '443',
                statusCode: 'HTTP_301',
              },
            }],
          },
        ],
      },
      { parent: this },
    );

    const logGroup = new aws.cloudwatch.LogGroup(`${shortName}-logs`, {
      name: `/ecs/${name}`,
      retentionInDays: 7,
      tags: resourceTags,
    }, { parent: this });

    const taskRole = new aws.iam.Role(`${shortName}-task-role`, {
      assumeRolePolicy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [{
          Action: 'sts:AssumeRole',
          Effect: 'Allow',
          Principal: { Service: 'ecs-tasks.amazonaws.com' },
        }],
      }),
      tags: resourceTags,
    }, { parent: this });

    new aws.iam.RolePolicy(`${shortName}-task-policy`, {
      role: taskRole.id,
      policy: pulumi.all([args.queueArn, args.s3BucketArns || []]).apply(([queueArn, s3Arns]) => 
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
                'sqs:GetQueueUrl'
              ],
              Resource: queueArn,
            },
            ...(s3Arns.length > 0 ? [{
              Effect: 'Allow',
              Action: [
                's3:GetObject',
                's3:PutObject',
                's3:DeleteObject',
                's3:ListBucket'
              ],
              Resource: s3Arns.flatMap((arn: string) => [arn, `${arn}/*`]),
            }] : []),
            {
              Effect: 'Allow',
              Action: [
                'route53domains:Get*',
                'route53domains:List*',
                'route53domains:CheckDomainAvailability'
              ],
              Resource: '*',
            },
          ],
        })
      ),
    }, { parent: this });

    const envVars = pulumi.output(args.environment).apply(env => 
        Object.entries(env).map(([name, value]) => ({ name, value }))
    );

    const cluster = new aws.ecs.Cluster(`${shortName}-cluster`, {
      tags: resourceTags,
    }, { parent: this });

    const service = new awsx.ecs.FargateService(
      `${shortName}-svc`,
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
      { parent: this, dependsOn: [logGroup, cluster] },
    );

    if (args.isProduction) {
      const scalingTarget = new aws.appautoscaling.Target(`${shortName}-scaling-target`, {
        maxCapacity: 10,
        minCapacity: 2,
        resourceId: pulumi.interpolate`service/${cluster.name}/${service.service.name}`,
        scalableDimension: 'ecs:service:DesiredCount',
        serviceNamespace: 'ecs',
      }, { parent: this, dependsOn: [service] });

      new aws.appautoscaling.Policy(`${shortName}-cpu-scaling`, {
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
      }, { parent: this });

      new aws.appautoscaling.Policy(`${shortName}-memory-scaling`, {
        policyType: 'TargetTrackingScaling',
        resourceId: scalingTarget.resourceId,
        scalableDimension: scalingTarget.scalableDimension,
        serviceNamespace: scalingTarget.serviceNamespace,
        targetTrackingScalingPolicyConfiguration: {
          predefinedMetricSpecification: {
            predefinedMetricType: 'ECSServiceAverageMemoryUtilization',
          },
          targetValue: 80,
          scaleInCooldown: 300,
          scaleOutCooldown: 60,
        },
      }, { parent: this });
    }

    if (args.hostedZoneId && args.domain) {
      let domainName: string;
      
      if (args.isPreview && args.prNumber) {
        domainName = `pr-${args.prNumber}.${args.domain}`;
      } else {
        domainName = args.domain;
      }
      
      new aws.route53.Record(`${shortName}-dns`, {
        zoneId: args.hostedZoneId,
        name: domainName,
        type: 'A',
        aliases: [{
          name: lb.loadBalancer.dnsName,
          zoneId: lb.loadBalancer.zoneId,
          evaluateTargetHealth: true,
        }],
      }, { parent: this });

      this.url = pulumi.output(`https://${domainName}`);
    } else {
      this.url = lb.loadBalancer.dnsName;
    }

    this.loadBalancerArnSuffix = lb.loadBalancer.arnSuffix;
    this.targetGroupArnSuffix = lb.defaultTargetGroup.arnSuffix;
    this.clusterArn = cluster.arn;
    this.serviceName = service.service.name;
    this.taskSecurityGroupId = args.taskSecurityGroup.id;
  }
}
