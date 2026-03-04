import * as pulumi from '@pulumi/pulumi'
import * as aws from '@pulumi/aws'
import { sortBy } from 'es-toolkit'

export interface ServiceConfig {
  environment: 'preview' | 'dev' | 'qa' | 'prod'
  stage: string

  imageUri: string

  vpcId: string
  securityGroupIds: string[]
  publicSubnetIds: string[]

  hostedZoneId: string
  domain: string
  certificateArn: string

  secrets: pulumi.Input<Record<string, pulumi.Input<string>>>
  environmentVariables: pulumi.Input<Record<string, pulumi.Input<string>>>

  permissions: pulumi.Input<
    {
      Effect: 'Allow' | 'Deny'
      Action: string[]
      Resource: pulumi.Input<pulumi.Input<string>[]>
    }[]
  >
  dependsOn: pulumi.ResourceOptions['dependsOn']
}

type ServiceOutput = {
  url: pulumi.Output<string>
  logGroupName: pulumi.Output<string>
  logGroupArn: pulumi.Output<string>
}

export function createService({
  environment,
  stage,
  imageUri,
  vpcId,
  securityGroupIds,
  publicSubnetIds,
  hostedZoneId,
  domain,
  certificateArn,
  secrets,
  environmentVariables,
  permissions,
  dependsOn,
}: ServiceConfig): ServiceOutput {
  const isProd = environment === 'prod'
  const serviceName = `gp-api-${stage}`

  const select = <T>(values: Record<'preview' | 'dev' | 'qa' | 'prod', T>): T =>
    values[environment]

  const clusterName = `gp-${stage}-fargateCluster`
  const cluster = new aws.ecs.Cluster('ecsCluster', {
    name: clusterName,
    settings: [{ name: 'containerInsights', value: 'enabled' }],
  })

  const albSecurityGroup = new aws.ec2.SecurityGroup('albSecurityGroup', {
    name: select({
      preview: `gp-api-preview-${stage}-sg`,
      dev: 'gp-api-developLoadBalancerSecurityGroup-5ba8676',
      qa: 'gp-api-qaLoadBalancerSecurityGroup-623a91f',
      prod: 'gp-api-masterLoadBalancerSecurityGroup-c8b2676',
    }),
    // This is false now, but these names are immutable :sob:
    description: 'Managed by SST',
    vpcId,
    ingress: [
      {
        protocol: 'tcp',
        fromPort: 80,
        toPort: 80,
        cidrBlocks: ['0.0.0.0/0'],
        description: 'HTTP',
      },
      {
        protocol: 'tcp',
        fromPort: 443,
        toPort: 443,
        cidrBlocks: ['0.0.0.0/0'],
        description: 'HTTPS',
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
  })

  const loadBalancer = new aws.lb.LoadBalancer('loadBalancer', {
    name: select({
      preview: `gpapi-${stage}`,
      dev: 'develop-gpapidevelopLoad',
      qa: 'g-qa-gpapiqaLoadBalancer',
      prod: 'master-gpapimasterLoadBa',
    }),
    internal: false,
    loadBalancerType: 'application',
    securityGroups: [albSecurityGroup.id],
    subnets: publicSubnetIds,
    enableCrossZoneLoadBalancing: true,
    idleTimeout: 120,
  })

  const targetGroup = new aws.lb.TargetGroup('targetGroup', {
    namePrefix: 'HTTP',
    port: 80,
    protocol: 'HTTP',
    targetType: 'ip',
    vpcId,
    deregistrationDelay: 120,
    healthCheck: {
      path: '/v1/health',
      interval: 60,
      timeout: 5,
      healthyThreshold: 2,
      unhealthyThreshold: 3,
      matcher: '200',
    },
  })

  new aws.lb.Listener('httpListener', {
    loadBalancerArn: loadBalancer.arn,
    port: 80,
    protocol: 'HTTP',
    defaultActions: [{ type: 'forward', targetGroupArn: targetGroup.arn }],
  })

  new aws.lb.Listener('httpsListener', {
    loadBalancerArn: loadBalancer.arn,
    port: 443,
    protocol: 'HTTPS',
    certificateArn,
    sslPolicy: 'ELBSecurityPolicy-TLS13-1-2-2021-06',
    defaultActions: [{ type: 'forward', targetGroupArn: targetGroup.arn }],
  })

  const logGroup = new aws.cloudwatch.LogGroup('logGroup', {
    name: `/sst/cluster/gp-${stage}-fargateCluster/gp-api-${stage}/gp-api-${stage}`,
    retentionInDays: isProd ? 60 : 30,
  })

  const executionRole = new aws.iam.Role('executionRole', {
    name: `gp-${stage}-gpapi${stage}ExecutionRole-uswest2`,
    assumeRolePolicy: JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'sts:AssumeRole',
          Effect: 'Allow',
          Principal: {
            Service: 'ecs-tasks.amazonaws.com',
          },
        },
      ],
    }),
    managedPolicyArns: [
      'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy',
    ],
    inlinePolicies: [
      {
        name: 'inline',
        policy: pulumi.jsonStringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Action: [
                'ssm:GetParameters',
                'ssm:GetParameterHistory',
                'ssm:GetParameter',
                'secretsmanager:GetSecretValue',
              ],
              Resource: '*',
            },
          ],
        }),
      },
    ],
  })

  const taskRole = new aws.iam.Role('taskRole', {
    name: `gp-${stage}-gpapi${stage}TaskRole-uswest2`,
    assumeRolePolicy: JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'sts:AssumeRole',
          Effect: 'Allow',
          Principal: {
            Service: 'ecs-tasks.amazonaws.com',
          },
        },
      ],
    }),
    inlinePolicies: [
      {
        name: 'inline',
        policy: pulumi.jsonStringify({
          Version: '2012-10-17',
          Statement: permissions,
        }),
      },
    ],
  })

  const cpu = isProd ? '1024' : '512'
  const memory = isProd ? '4096' : '2048'

  const taskDefinition = new aws.ecs.TaskDefinition('taskDefinition', {
    family: `gp-${stage}-fargateCluster-gp-api-${stage}`,
    networkMode: 'awsvpc',
    requiresCompatibilities: ['FARGATE'],
    cpu,
    memory,
    executionRoleArn: executionRole.arn,
    taskRoleArn: taskRole.arn,
    runtimePlatform: {
      cpuArchitecture: 'X86_64',
      operatingSystemFamily: 'LINUX',
    },
    containerDefinitions: pulumi.jsonStringify(
      pulumi.all([environmentVariables, secrets]).apply(([env, sec]) => [
        {
          name: serviceName,
          image: imageUri,
          cpu: parseInt(cpu),
          memory: parseInt(memory),
          essential: true,
          secrets: sortBy(Object.entries(sec), [([name]) => name]).map(
            ([name, valueFrom]) => ({
              name,
              valueFrom,
            }),
          ),
          portMappings: [
            {
              containerPort: 80,
              hostPort: 80,
              protocol: 'tcp',
            },
          ],
          environment: sortBy(Object.entries(env), [([name]) => name]).map(
            ([name, value]) => ({
              name,
              value,
            }),
          ),
          logConfiguration: {
            logDriver: 'awslogs',
            options: {
              'awslogs-group': logGroup.name,
              'awslogs-region': 'us-west-2',
              'awslogs-stream-prefix': '/service',
            },
          },
          pseudoTerminal: true,
          linuxParameters: {
            initProcessEnabled: true,
          },
        },
      ]),
    ),
  })

  new aws.ecs.Service(
    'ecsService',
    {
      name: serviceName,
      cluster: cluster.arn,
      taskDefinition: taskDefinition.arn,
      desiredCount: isProd ? 2 : 1,
      capacityProviderStrategies: [{ capacityProvider: 'FARGATE', weight: 1 }],
      networkConfiguration: {
        subnets: publicSubnetIds,
        securityGroups: securityGroupIds,
        assignPublicIp: true,
      },
      loadBalancers: [
        {
          targetGroupArn: targetGroup.arn,
          containerName: serviceName,
          containerPort: 80,
        },
      ],
      healthCheckGracePeriodSeconds: 120,
      deploymentCircuitBreaker: {
        enable: true,
        rollback: true,
      },
      enableExecuteCommand: true,
      waitForSteadyState: true,
    },
    { dependsOn },
  )

  new aws.route53.Record('dnsARecord', {
    zoneId: hostedZoneId,
    name: domain,
    type: 'A',
    aliases: [
      {
        name: loadBalancer.dnsName,
        zoneId: loadBalancer.zoneId,
        evaluateTargetHealth: true,
      },
    ],
  })
  new aws.route53.Record('dnsAAAARecord', {
    zoneId: hostedZoneId,
    name: domain,
    type: 'AAAA',
    aliases: [
      {
        name: loadBalancer.dnsName,
        zoneId: loadBalancer.zoneId,
        evaluateTargetHealth: true,
      },
    ],
  })

  return {
    url: pulumi.interpolate`https://${domain}`,
    logGroupName: logGroup.name,
    logGroupArn: logGroup.arn,
  }
}
