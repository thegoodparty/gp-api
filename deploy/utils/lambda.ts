import type AWS from '@pulumi/aws'
import type { FunctionArgs } from '@pulumi/aws/lambda'
import type * as pulumi from '@pulumi/pulumi'

export type LambdaConfig = Omit<
  FunctionArgs,
  'name' | 'role' | 'code' | 'handler'
> & {
  name: string
  filename: string
  policy?: {
    Resources: (string | pulumi.Output<string>)[]
    Actions: string[]
  }[]
}

export const lambda = async (aws: typeof AWS, config: LambdaConfig) => {
  const pulumi = await import('@pulumi/pulumi')
  const role = new aws.iam.Role(`${config.name}-role`, {
    name: `${config.name}-role`,
    assumeRolePolicy: JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: 'sts:AssumeRole',
          Principal: { Service: 'lambda.amazonaws.com' },
        },
      ],
    }),
  })

  const logGroup = new aws.cloudwatch.LogGroup(`${config.name}-log-group`, {
    name: `/aws/lambda/${config.name}`,
    retentionInDays: 30,
  })

  // Build the policy with proper handling of Pulumi outputs
  // Collect all outputs that need to be resolved
  const logResourceOutput = pulumi.interpolate`${logGroup.arn}:*`
  
  // If there are custom policies, we need to resolve all their Resources
  const policyDocument = config.policy && config.policy.length > 0
    ? pulumi.all([logResourceOutput, ...config.policy.map(p => pulumi.output(p.Resources))]).apply(
        ([logResource, ...customResources]: [string, ...any[]]) => {
          const statements = [
            {
              Actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
              Resources: [logResource],
            },
            ...config.policy!.map((p, i) => ({
              Actions: p.Actions,
              Resources: customResources[i],
            })),
          ]
          return JSON.stringify({
            Version: '2012-10-17',
            Statement: statements,
          })
        }
      )
    : pulumi.interpolate`{
        "Version": "2012-10-17",
        "Statement": [
          {
            "Actions": ["logs:CreateLogStream", "logs:PutLogEvents"],
            "Resources": ["${logResourceOutput}"]
          }
        ]
      }`

  new aws.iam.RolePolicy(`${config.name}-policy`, {
    role: role.name,
    policy: policyDocument,
  })

  const lambda = new aws.lambda.Function(`${config.name}-function`, {
    ...config,
    code: new pulumi.asset.AssetArchive({
      'index.js': new pulumi.asset.FileAsset(
        `../../../dist/lambdas/${config.filename}`,
      ),
    }),
    handler: 'index.handler',
    role: role.arn,
  })

  return lambda
}
