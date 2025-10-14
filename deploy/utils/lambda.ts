import type AWS from '@pulumi/aws'
import type { FunctionArgs } from '@pulumi/aws/lambda'
import Pulumi, { Output } from '@pulumi/pulumi'
import path from 'path'

export type LambdaConfig = Omit<
  FunctionArgs,
  'name' | 'role' | 'code' | 'handler'
> & {
  name: string
  filename: string
  policy?: {
    Resources: (string | Output<string>)[]
    Actions: string[]
  }[]
}

export const lambda = (
  aws: typeof AWS,
  pulumi: typeof Pulumi,
  { filename, policy, ...config }: LambdaConfig,
) => {
  const role = new aws.iam.Role(`${config.name}-role`, {
    name: `${config.name}-role`,
    assumeRolePolicy: {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: 'sts:AssumeRole',
          Principal: { Service: 'lambda.amazonaws.com' },
        },
      ],
    },
  })

  const logGroup = new aws.cloudwatch.LogGroup(`${config.name}-log-group`, {
    name: `/aws/lambda/${config.name}`,
    retentionInDays: 30,
  })

  new aws.iam.RolePolicy(`${config.name}-policy`, {
    role: role.name,
    policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
          Resource: [pulumi.interpolate`${logGroup.arn}:*`],
        },
      ],
    },
  })

  // Swain: I have no idea why this is the right path to our dist directory during the
  // SST deploy, but it is. SST is doing some kind of weird stuff with the sst.config.ts
  // file, such that it must get moved around during the deploy or something.
  const filepath = path.join(__dirname, `../../../dist/lambdas/${filename}.zip`)

  const code = new pulumi.asset.FileArchive(filepath)

  const lambda = new aws.lambda.Function(`${config.name}-function`, {
    ...config,
    code,
    handler: 'index.handler',
    role: role.arn,
  })

  return lambda
}
