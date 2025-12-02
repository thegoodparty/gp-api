import * as pulumi from '@pulumi/pulumi';
import * as awsx from '@pulumi/awsx';
import * as aws from '@pulumi/aws';

export interface ComputeArgs {
  vpcId: pulumi.Input<string>;
  publicSubnetIds: pulumi.Input<string[]>;
  securityGroupId: pulumi.Input<string>;
  imageUri: pulumi.Input<string>;
  isProduction: boolean;
  certificateArn: pulumi.Input<string>;
  
  // Environment variables to inject (key-value pairs)
  environment: pulumi.Input<Record<string, pulumi.Input<string>>>;
}

export class Compute extends pulumi.ComponentResource {
  public readonly url: pulumi.Output<string>;

  constructor(
    name: string,
    args: ComputeArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super('gp:compute:Compute', name, {}, opts);

    // Shorten name to stay under 32 char AWS limit
    const shortName = name.length > 20 ? name.substring(0, 20) : name;

    // Create Security Group for ECS Tasks (allows traffic from ALB)
    const taskSecurityGroup = new aws.ec2.SecurityGroup(`${shortName}-task-sg`, {
      vpcId: args.vpcId,
      description: 'Security group for ECS tasks',
      ingress: [
        {
          protocol: 'tcp',
          fromPort: 80,
          toPort: 80,
          securityGroups: [args.securityGroupId], // Allow from ALB SG
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
    }, { parent: this });

    // Create Application Load Balancer
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
          // HTTPS Listener (Primary)
          {
            port: 443,
            protocol: 'HTTPS',
            certificateArn: args.certificateArn,
          },
          // HTTP Listener (Redirect to HTTPS)
          {
            port: 80,
            protocol: 'HTTP',
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
    }, { parent: this });

    new aws.iam.RolePolicy(`${shortName}-task-policy`, {
      role: taskRole.id,
      policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: ['sqs:*'],
            Resource: '*',
          },
          {
            Effect: 'Allow',
            Action: ['s3:*', 's3-object-lambda:*'],
            Resource: '*',
          },
          {
            Effect: 'Allow',
            Action: ['route53domains:Get*', 'route53domains:List*', 'route53domains:CheckDomainAvailability'],
            Resource: '*',
          },
        ],
      }),
    }, { parent: this });

    const envVars = pulumi.output(args.environment).apply(env => 
        Object.entries(env).map(([name, value]) => ({ name, value }))
    );

    const service = new awsx.ecs.FargateService(
      `${shortName}-svc`,
      {
        cluster: undefined,
        networkConfiguration: {
          subnets: args.publicSubnetIds,
          securityGroups: [taskSecurityGroup.id],
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
      { parent: this, dependsOn: [logGroup] },
    );

    this.url = lb.loadBalancer.dnsName;
  }
}
