import type AWS from '@pulumi/aws'
import type { FunctionArgs } from '@pulumi/aws/lambda'

export type LambdaConfig = Omit<
  FunctionArgs,
  'name' | 'role' | 'code' | 'handler'
> & {
  name: string
  filename: string
  policy?: {
    Resources: string[]
    Actions: string[]
  }[]
}

export const lambda = async (aws: typeof AWS, config: LambdaConfig) => {
  const pulumi = await import('@pulumi/pulumi')
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
          Resource: ['*'],
        },
      ],
    },
  })

  const lambda = new aws.lambda.Function(`${config.name}-function`, {
    ...config,
    code: new pulumi.asset.AssetArchive({
      'index.js': new pulumi.asset.FileAsset(
        `${__dirname}/../dist/lambdas/${config.filename}`,
      ),
    }),
    handler: 'index.handler',
    role: role.arn,
  })

  return lambda
}
