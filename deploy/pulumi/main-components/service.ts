import * as pulumi from '@pulumi/pulumi'
import * as aws from '@pulumi/aws'

export interface ServiceConfig {
  environment: 'dev' | 'qa' | 'prod'
  stage: 'develop' | 'qa' | 'master'

  imageUri: string

  vpcId: string
  securityGroupIds: string[]
  publicSubnetIds: string[]

  hostedZoneId: string
  domain: string
  certificateArn: string

  environmentVariables: pulumi.Input<Record<string, pulumi.Input<string>>>

  permissions: pulumi.Input<
    {
      Effect?: 'Allow' | 'Deny'
      Action: string[]
      Resource: pulumi.Input<pulumi.Input<string>[]>
    }[]
  >
}

export async function createService({
  environment,
  stage,
  imageUri,
  vpcId,
  securityGroupIds,
  publicSubnetIds,
  hostedZoneId,
  domain,
  certificateArn,
  environmentVariables,
  permissions,
}: ServiceConfig) {
  const isProd = environment === 'prod'
  const serviceName = `gp-api-${stage}`

  const select = <T>(values: Record<'dev' | 'qa' | 'prod', T>): T =>
    values[environment]

  const clusterName = `gp-${stage}-fargateCluster`
  const cluster = new aws.ecs.Cluster(
    'ecsCluster',
    {
      name: clusterName,
      settings: [{ name: 'containerInsights', value: 'enabled' }],
    },
    { import: `gp-${stage}-fargateCluster` },
  )

  const albSecurityGroup = new aws.ec2.SecurityGroup(
    'albSecurityGroup',
    {
      name: select({
        dev: 'gp-api-developLoadBalancerSecurityGroup-5ba8676',
        qa: 'gp-api-qaLoadBalancerSecurityGroup-623a91f',
        prod: 'gp-api-masterLoadBalancerSecurityGroup-c8b2676',
      }),
      // This is false now, but these names are immutable :sob:
      description: 'Managed by SST',
      vpcId,
      ingress: [
        {
          protocol: '-1',
          fromPort: 0,
          toPort: 0,
          cidrBlocks: ['0.0.0.0/0'],
          description: 'HTTP',
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
    },
    {
      import: select({
        dev: 'sg-0e01f208be74c2a2b',
        qa: 'sg-0f413bf49bc13263c',
        prod: 'sg-0932276b8e20ca783',
      }),
    },
  )

  const loadBalancer = new aws.lb.LoadBalancer(
    'loadBalancer',
    {
      name: select({
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
    },
    {
      import: select({
        dev: 'arn:aws:elasticloadbalancing:us-west-2:333022194791:loadbalancer/app/develop-gpapidevelopLoad/16410e47429c17d1',
        qa: 'arn:aws:elasticloadbalancing:us-west-2:333022194791:loadbalancer/app/g-qa-gpapiqaLoadBalancer/73f93033317100c1',
        prod: 'arn:aws:elasticloadbalancing:us-west-2:333022194791:loadbalancer/app/master-gpapimasterLoadBa/d430f27783828ed7',
      }),
    },
  )

  const targetGroup = new aws.lb.TargetGroup(
    'targetGroup',
    {
      namePrefix: 'HTTP',
      port: 80,
      protocol: 'HTTP',
      targetType: 'ip',
      vpcId,
      healthCheck: {
        path: '/v1/health',
        interval: 10,
        timeout: 5,
        healthyThreshold: 2,
        unhealthyThreshold: 3,
        matcher: '200',
      },
    },
    {
      import: select({
        dev: 'arn:aws:elasticloadbalancing:us-west-2:333022194791:targetgroup/HTTP20241127163341723200000002/30d4b50f0566a980',
        qa: 'arn:aws:elasticloadbalancing:us-west-2:333022194791:targetgroup/HTTP20250308024355538100000003/05618ac26e44cfe3',
        prod: 'arn:aws:elasticloadbalancing:us-west-2:333022194791:targetgroup/HTTP20250222201547538200000002/98aae02c3d211dfb',
      }),
    },
  )

  new aws.lb.Listener(
    'httpListener',
    {
      loadBalancerArn: loadBalancer.arn,
      port: 80,
      protocol: 'HTTP',
      defaultActions: [{ type: 'forward', targetGroupArn: targetGroup.arn }],
    },
    {
      import: select({
        dev: 'arn:aws:elasticloadbalancing:us-west-2:333022194791:listener/app/develop-gpapidevelopLoad/16410e47429c17d1/5c57764afeffbf3e',
        qa: 'arn:aws:elasticloadbalancing:us-west-2:333022194791:listener/app/g-qa-gpapiqaLoadBalancer/73f93033317100c1/944e2475965ff40e',
        prod: 'arn:aws:elasticloadbalancing:us-west-2:333022194791:listener/app/master-gpapimasterLoadBa/d430f27783828ed7/d53a34e36e8b6ed8',
      }),
    },
  )

  new aws.lb.Listener(
    'httpsListener',
    {
      loadBalancerArn: loadBalancer.arn,
      port: 443,
      protocol: 'HTTPS',
      certificateArn,
      defaultActions: [{ type: 'forward', targetGroupArn: targetGroup.arn }],
    },
    {
      import: select({
        dev: 'arn:aws:elasticloadbalancing:us-west-2:333022194791:listener/app/develop-gpapidevelopLoad/16410e47429c17d1/b490c38dfe602284',
        qa: 'arn:aws:elasticloadbalancing:us-west-2:333022194791:listener/app/g-qa-gpapiqaLoadBalancer/73f93033317100c1/c29a625017d92fb0',
        prod: 'arn:aws:elasticloadbalancing:us-west-2:333022194791:listener/app/master-gpapimasterLoadBa/d430f27783828ed7/9eea23e24d6d1617',
      }),
    },
  )

  const logGroupName = `/sst/cluster/gp-${stage}-fargateCluster/gp-api-${stage}/gp-api-${stage}`

  const logGroup = new aws.cloudwatch.LogGroup(
    'logGroup',
    {
      name: logGroupName,
      retentionInDays: isProd ? 60 : 30,
    },
    {
      import: logGroupName,
    },
  )

  const executionRole = new aws.iam.Role(
    'executionRole',
    {
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
    },
    {
      import: `gp-${stage}-gpapi${stage}ExecutionRole-uswest2`,
    },
  )

  const taskRole = new aws.iam.Role(
    'taskRole',
    {
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
    },
    {
      import: `gp-${stage}-gpapi${stage}TaskRole-uswest2`,
    },
  )

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
      pulumi.output(environmentVariables).apply((env) => [
        {
          name: serviceName,
          image: imageUri,
          cpu: parseInt(cpu),
          memory: parseInt(memory),
          essential: true,
          portMappings: [
            {
              containerPort: 80,
              hostPort: 80,
              protocol: 'tcp',
            },
          ],
          environment: Object.entries(env).map(([name, value]) => ({
            name,
            value,
          })),
          logConfiguration: {
            logDriver: 'awslogs',
            options: {
              'awslogs-group': logGroupName,
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

  const desiredCount = isProd ? 2 : 1

  const service = new aws.ecs.Service(
    'ecsService',
    {
      name: serviceName,
      cluster: cluster.arn,
      taskDefinition: taskDefinition.arn,
      desiredCount,
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
      deploymentCircuitBreaker: {
        enable: true,
        rollback: true,
      },
      enableExecuteCommand: true,
      // TODO: SWAIN: Set to false during import, can enable later for deployments
      // forceNewDeployment: true,
      waitForSteadyState: true,
    },
    {
      import: `${clusterName}/${serviceName}`,
    },
  )

  new aws.route53.Record(
    'dnsARecord',
    {
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
    },
    {
      import: select({
        dev: `${hostedZoneId}_gp-api-dev.goodparty.org_A`,
        qa: `${hostedZoneId}_gp-api-qa.goodparty.org_A`,
        prod: `${hostedZoneId}_gp-api.goodparty.org_A`,
      }),
    },
  )
  new aws.route53.Record(
    'dnsAAAARecord',
    {
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
    },
    {
      import: select({
        dev: `${hostedZoneId}_gp-api-dev.goodparty.org_AAAA`,
        qa: `${hostedZoneId}_gp-api-qa.goodparty.org_AAAA`,
        prod: `${hostedZoneId}_gp-api.goodparty.org_AAAA`,
      }),
    },
  )

  return {
    cluster,
    loadBalancer,
    targetGroup,
    service,
    taskDefinition,
    taskRole,
    executionRole,
    logGroup,
    url: pulumi.interpolate`https://${domain}`,
  }
}
