import * as pulumi from '@pulumi/pulumi'
import * as aws from '@pulumi/aws'

export interface WorkerServiceConfig {
  environment: 'preview' | 'dev' | 'qa' | 'prod'
  stage: string
  imageUri: string
  vpcId: string
  securityGroupIds: string[]
  publicSubnetIds: string[]
  clusterArn: pulumi.Input<string>
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

export function createWorkerService({
  environment,
  stage,
  imageUri,
  securityGroupIds,
  publicSubnetIds,
  clusterArn,
  environmentVariables,
  permissions,
  dependsOn,
}: WorkerServiceConfig) {
  const isProd = environment === 'prod'
  const serviceName = `gp-worker-${stage}`

  const logGroupName = `/ecs/gp-worker-${stage}`

  const logGroup = new aws.cloudwatch.LogGroup('workerLogGroup', {
    name: logGroupName,
    retentionInDays: isProd ? 60 : 30,
  })

  const executionRole = new aws.iam.Role('workerExecutionRole', {
    name: `gp-${stage}-workerExecutionRole-uswest2`,
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

  const taskRole = new aws.iam.Role('workerTaskRole', {
    name: `gp-${stage}-workerTaskRole-uswest2`,
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

  const cpu = isProd ? '512' : '256'
  const memory = isProd ? '1024' : '512'

  const taskDefinition = new aws.ecs.TaskDefinition('workerTaskDefinition', {
    family: `gp-worker-${stage}`,
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
          command: ['node', '-r', './newrelic.js', 'dist/src/worker'],
          secrets: [
            {
              name: 'INNGEST_EVENT_KEY',
              valueFrom:
                'arn:aws:ssm:us-west-2:333022194791:parameter/swain-inngest-poc-event-key',
            },
            {
              name: 'INNGEST_SIGNING_KEY',
              valueFrom:
                'arn:aws:ssm:us-west-2:333022194791:parameter/swain-inngest-poc-signing-key',
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
              'awslogs-stream-prefix': '/worker',
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
    'workerEcsService',
    {
      name: serviceName,
      cluster: clusterArn,
      taskDefinition: taskDefinition.arn,
      desiredCount: 1,
      capacityProviderStrategies: [{ capacityProvider: 'FARGATE', weight: 1 }],
      networkConfiguration: {
        subnets: publicSubnetIds,
        securityGroups: securityGroupIds,
        assignPublicIp: true,
      },
      deploymentCircuitBreaker: {
        enable: true,
        rollback: true,
      },
      enableExecuteCommand: true,
      waitForSteadyState: true,
    },
    { dependsOn: [logGroup, ...(Array.isArray(dependsOn) ? dependsOn : [])] },
  )
}
