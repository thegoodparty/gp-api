import * as fs from 'fs'
import * as path from 'path'
import {
  ComponentResource,
  ComponentResourceOptions,
  Input,
  interpolate,
  jsonStringify,
  secret,
} from '@pulumi/pulumi'
import { all, output } from '@pulumi/pulumi'
import { ServiceArgs } from './sst-service'
import { Image, ImageArgs, Platform } from '@pulumi/docker-build'
import {
  cloudwatch,
  ecr,
  ecs,
  getPartitionOutput,
  getRegionOutput,
  iam,
} from '@pulumi/aws'
import { bootstrap } from './helpers/bootstrap'

function imageBuilder(
  name: string,
  args: ImageArgs,
  opts?: ComponentResourceOptions,
) {
  // Wait for the all args values to be resolved before acquiring the semaphore
  return all([args]).apply(async ([args]) => {
    const image = new Image(
      name,
      {
        ...(process.env.BUILDX_BUILDER
          ? { builder: { name: process.env.BUILDX_BUILDER } }
          : {}),
        ...args,
      },
      opts,
    )
    return image.urn.apply(() => {
      return image
    })
  })
}

type Size = `${number} ${'MB' | 'GB'}`
type SizeGbTb = `${number} ${'GB' | 'TB'}`

function toMBs(size: Size | SizeGbTb) {
  const [count, unit] = size.split(' ')
  const countNum = parseFloat(count)
  if (unit === 'MB') {
    return countNum
  } else if (unit === 'GB') {
    return countNum * 1024
  } else if (unit === 'TB') {
    return countNum * 1024 * 1024
  }
  throw new Error(`Invalid size ${size}`)
}

type Cpu = `${number} ${'vCPU'}`

function toNumber(cpu: Cpu) {
  const [count, unit] = cpu.split(' ')
  const countNum = parseFloat(count)
  if (unit === 'vCPU') {
    return countNum * 1024
  }
  throw new Error(`Invalid CPU ${cpu}`)
}

const supportedCpus = {
  '0.25 vCPU': 256,
  '0.5 vCPU': 512,
  '1 vCPU': 1024,
  '2 vCPU': 2048,
  '4 vCPU': 4096,
  '8 vCPU': 8192,
  '16 vCPU': 16384,
}

const supportedMemories = {
  '0.25 vCPU': {
    '0.5 GB': 512,
    '1 GB': 1024,
    '2 GB': 2048,
  },
  '0.5 vCPU': {
    '1 GB': 1024,
    '2 GB': 2048,
    '3 GB': 3072,
    '4 GB': 4096,
  },
  '1 vCPU': {
    '2 GB': 2048,
    '3 GB': 3072,
    '4 GB': 4096,
    '5 GB': 5120,
    '6 GB': 6144,
    '7 GB': 7168,
    '8 GB': 8192,
  },
  '2 vCPU': {
    '4 GB': 4096,
    '5 GB': 5120,
    '6 GB': 6144,
    '7 GB': 7168,
    '8 GB': 8192,
    '9 GB': 9216,
    '10 GB': 10240,
    '11 GB': 11264,
    '12 GB': 12288,
    '13 GB': 13312,
    '14 GB': 14336,
    '15 GB': 15360,
    '16 GB': 16384,
  },
  '4 vCPU': {
    '8 GB': 8192,
    '9 GB': 9216,
    '10 GB': 10240,
    '11 GB': 11264,
    '12 GB': 12288,
    '13 GB': 13312,
    '14 GB': 14336,
    '15 GB': 15360,
    '16 GB': 16384,
    '17 GB': 17408,
    '18 GB': 18432,
    '19 GB': 19456,
    '20 GB': 20480,
    '21 GB': 21504,
    '22 GB': 22528,
    '23 GB': 23552,
    '24 GB': 24576,
    '25 GB': 25600,
    '26 GB': 26624,
    '27 GB': 27648,
    '28 GB': 28672,
    '29 GB': 29696,
    '30 GB': 30720,
  },
  '8 vCPU': {
    '16 GB': 16384,
    '20 GB': 20480,
    '24 GB': 24576,
    '28 GB': 28672,
    '32 GB': 32768,
    '36 GB': 36864,
    '40 GB': 40960,
    '44 GB': 45056,
    '48 GB': 49152,
    '52 GB': 53248,
    '56 GB': 57344,
    '60 GB': 61440,
  },
  '16 vCPU': {
    '32 GB': 32768,
    '40 GB': 40960,
    '48 GB': 49152,
    '56 GB': 57344,
    '64 GB': 65536,
    '72 GB': 73728,
    '80 GB': 81920,
    '88 GB': 90112,
    '96 GB': 98304,
    '104 GB': 106496,
    '112 GB': 114688,
    '120 GB': 122880,
  },
}

type FunctionPermissionArgs = {
  /**
   * Configures whether the permission is allowed or denied.
   * @default `"allow"`
   * @example
   * ```ts
   * {
   *   effect: "deny"
   * }
   * ```
   */
  effect?: 'allow' | 'deny'
  /**
   * The [IAM actions](https://docs.aws.amazon.com/service-authorization/latest/reference/reference_policies_actions-resources-contextkeys.html#actions_table) that can be performed.
   * @example
   * ```js
   * {
   *   actions: ["s3:*"]
   * }
   * ```
   */
  actions: string[]
  /**
   * The resourcess specified using the [IAM ARN format](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_identifiers.html).
   * @example
   * ```js
   * {
   *   resources: ["arn:aws:s3:::my-bucket/*"]
   * }
   * ```
   */
  resources: Input<Input<string>[]>
}

export interface FargateBaseArgs {
  clusterName: string
  architecture?: Input<'x86_64'>
  cpu: keyof typeof supportedCpus
  memory: `${number} GB`
  storage: `${number} GB`
  permissions: Input<FunctionPermissionArgs[]>
  image: Input<{
    context: Input<string>
    dockerfile: Input<string>
    args: Input<Record<string, Input<string>>>
  }>
  environment: Input<Record<string, Input<string>>>
  logging: Input<{
    retentionInDays: Input<number>
    logGroupName: Input<string>
  }>
  taskRole?: Input<string>
  executionRole?: Input<string>
}

export function normalizeArchitecture() {
  return output('x86_64')
}

export function normalizeCpu(args: FargateBaseArgs) {
  return output(args.cpu ?? '0.25 vCPU').apply((v) => {
    if (!supportedCpus[v]) {
      throw new Error(
        `Unsupported CPU: ${v}. The supported values for CPU are ${Object.keys(
          supportedCpus,
        ).join(', ')}`,
      )
    }
    return v
  })
}

export function normalizeMemory(
  cpu: ReturnType<typeof normalizeCpu>,
  args: FargateBaseArgs,
) {
  return all([cpu, args.memory ?? '0.5 GB']).apply(([cpu, v]) => {
    if (!(v in supportedMemories[cpu])) {
      throw new Error(
        `Unsupported memory: ${v}. The supported values for memory for a ${cpu} CPU are ${Object.keys(
          supportedMemories[cpu],
        ).join(', ')}`,
      )
    }
    return v
  })
}

export function normalizeContainers(args: ServiceArgs, name: string) {
  // Normalize container props
  return output([
    {
      name: name,
      cpu: args.cpu,
      memory: args.memory,
      image: args.image,
      logging: args.logging,
      environment: args.environment,
    },
  ]).apply((containers) =>
    containers.map((v) => {
      return {
        ...v,
        image: normalizeImage(),
      }

      function normalizeImage() {
        return all([v.image]).apply(([image]) => {
          return {
            ...image,
            context: image?.context ?? '.',
            platform: Platform.Linux_amd64,
          }
        })
      }
    }),
  )
}

export function createTaskRole(
  name: string,
  args: FargateBaseArgs,
  opts: ComponentResourceOptions,
  parent: ComponentResource,
  additionalPermissions?: Input<FunctionPermissionArgs[]>,
) {
  if (args.taskRole)
    return iam.Role.get(`${name}TaskRole`, args.taskRole, {}, { parent })

  const policy = all([
    args.permissions ?? [],
    additionalPermissions ?? [],
  ]).apply(([argsPermissions, additionalPermissions]) =>
    iam.getPolicyDocumentOutput({
      statements: [
        ...argsPermissions,
        ...additionalPermissions,
        {
          actions: [
            'ssmmessages:CreateControlChannel',
            'ssmmessages:CreateDataChannel',
            'ssmmessages:OpenControlChannel',
            'ssmmessages:OpenDataChannel',
          ],
          resources: ['*'],
        },
      ].map((item) => ({
        effect: (() => {
          const effect = item.effect ?? 'allow'
          return effect.charAt(0).toUpperCase() + effect.slice(1)
        })(),
        actions: item.actions,
        resources: item.resources,
      })),
    }),
  )

  return new iam.Role(
    `${name}TaskRole`,
    {
      assumeRolePolicy: iam.assumeRolePolicyForPrincipal({
        Service: 'ecs-tasks.amazonaws.com',
      }),
      inlinePolicies: policy.apply(({ statements }) =>
        statements ? [{ name: 'inline', policy: policy.json }] : [],
      ),
    },
    { parent },
  )
}

export function createExecutionRole(
  name: string,
  args: FargateBaseArgs,
  opts: ComponentResourceOptions,
  parent: ComponentResource,
) {
  if (args.executionRole)
    return iam.Role.get(
      `${name}ExecutionRole`,
      args.executionRole,
      {},
      { parent },
    )

  return new iam.Role(
    `${name}ExecutionRole`,
    {
      assumeRolePolicy: iam.assumeRolePolicyForPrincipal({
        Service: 'ecs-tasks.amazonaws.com',
      }),
      managedPolicyArns: [
        interpolate`arn:${
          getPartitionOutput({}, opts).partition
        }:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy`,
      ],
      inlinePolicies: [
        {
          name: 'inline',
          policy: iam.getPolicyDocumentOutput({
            statements: [
              {
                sid: 'ReadSsmAndSecrets',
                actions: [
                  'ssm:GetParameters',
                  'ssm:GetParameter',
                  'ssm:GetParameterHistory',
                  'secretsmanager:GetSecretValue',
                ],
                resources: ['*'],
              },
            ],
          }).json,
        },
      ],
    },
    { parent },
  )
}

export function createTaskDefinition(
  name: string,
  args: ServiceArgs,
  opts: ComponentResourceOptions,
  parent: ComponentResource,
  containers: ReturnType<typeof normalizeContainers>,
  architecture: ReturnType<typeof normalizeArchitecture>,
  cpu: ReturnType<typeof normalizeCpu>,
  memory: ReturnType<typeof normalizeMemory>,
  taskRole: ReturnType<typeof createTaskRole>,
  executionRole: ReturnType<typeof createExecutionRole>,
) {
  const clusterName = args.clusterName
  const region = getRegionOutput({}, opts).name
  const bootstrapData = region.apply((region) => bootstrap.forRegion(region))
  const containerDefinitions = output(containers).apply((containers) =>
    containers.map((container) => ({
      name: container.name,
      image: (() => {
        if (typeof container.image === 'string') return output(container.image)

        const containerImage = container.image
        const contextPath = path.join($cli.paths.root, container.image.context)
        const dockerfile = container.image.dockerfile ?? 'Dockerfile'
        const dockerfilePath = path.join(contextPath, dockerfile)
        const dockerIgnorePath = fs.existsSync(
          path.join(contextPath, `${dockerfile}.dockerignore`),
        )
          ? path.join(contextPath, `${dockerfile}.dockerignore`)
          : path.join(contextPath, '.dockerignore')

        // add .sst to .dockerignore if not exist
        const lines = fs.existsSync(dockerIgnorePath)
          ? fs.readFileSync(dockerIgnorePath).toString().split('\n')
          : []
        if (!lines.find((line) => line === '.sst')) {
          fs.writeFileSync(
            dockerIgnorePath,
            [...lines, '', '# sst', '.sst'].join('\n'),
          )
        }

        // Build image
        const image = imageBuilder(
          `${name}Image${container.name}`,
          {
            context: { location: contextPath },
            dockerfile: { location: dockerfilePath },
            buildArgs: containerImage.args,
            platforms: [container.image.platform],
            tags: [container.name].map(
              (tag) => interpolate`${bootstrapData.assetEcrUrl}:${tag}`,
            ),
            registries: [
              ecr
                .getAuthorizationTokenOutput(
                  {
                    registryId: bootstrapData.assetEcrRegistryId,
                  },
                  { parent },
                )
                .apply((authToken) => ({
                  address: authToken.proxyEndpoint,
                  password: secret(authToken.password),
                  username: authToken.userName,
                })),
            ],
            cacheFrom: [
              {
                registry: {
                  ref: interpolate`${bootstrapData.assetEcrUrl}:${container.name}-cache`,
                },
              },
            ],
            cacheTo: [
              {
                registry: {
                  ref: interpolate`${bootstrapData.assetEcrUrl}:${container.name}-cache`,
                  imageManifest: true,
                  ociMediaTypes: true,
                  mode: 'max',
                },
              },
            ],
            push: true,
          },
          { parent },
        )

        return interpolate`${bootstrapData.assetEcrUrl}@${image.digest}`
      })(),
      cpu: container.cpu ? toNumber(container.cpu) : undefined,
      memory: container.memory ? toMBs(container.memory) : undefined,
      pseudoTerminal: true,
      portMappings: [{ containerPortRange: '1-65535' }],
      logConfiguration: {
        logDriver: 'awslogs',
        options: {
          'awslogs-group': (() => {
            return new cloudwatch.LogGroup(
              `${name}LogGroup${container.name}`,
              {
                name: container.logging.name,
                retentionInDays: container.logging.retentionInDays,
              },
              { parent, ignoreChanges: ['name'] },
            )
          })().name,
          'awslogs-region': region,
          'awslogs-stream-prefix': '/service',
        },
      },
      environment: Object.entries(container.environment).map(
        ([name, value]) => ({ name, value }),
      ),
      linuxParameters: {
        initProcessEnabled: true,
      },
    })),
  )

  return new ecs.TaskDefinition(
    `${name}Task`,
    {
      family: interpolate`${clusterName}-${name}`,
      trackLatest: true,
      cpu: cpu.apply((v) => toNumber(v).toString()),
      memory: memory.apply((v) => toMBs(v).toString()),
      networkMode: 'awsvpc',
      requiresCompatibilities: ['FARGATE'],
      runtimePlatform: {
        cpuArchitecture: architecture.apply((v) => v.toUpperCase()),
        operatingSystemFamily: 'LINUX',
      },
      executionRoleArn: executionRole.arn,
      taskRoleArn: taskRole.arn,
      containerDefinitions: jsonStringify(containerDefinitions),
    },
    { parent },
  )
}
