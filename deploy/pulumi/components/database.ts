import * as pulumi from '@pulumi/pulumi'
import * as aws from '@pulumi/aws'
import * as random from '@pulumi/random'

export interface DatabaseArgs {
  vpcId: pulumi.Input<string>
  subnetIds: pulumi.Input<string[]>
  securityGroupId: pulumi.Input<string>
  ecsSecurityGroupId: pulumi.Input<string>
  isPreview: boolean
  prNumber?: string
  clusterIdentifier?: string
  tags?: Record<string, string>
}

export class Database extends pulumi.ComponentResource {
  public readonly url: pulumi.Output<string>
  public readonly secretArn: pulumi.Output<string>
  public readonly password?: pulumi.Output<string>
  public readonly instance?: aws.rds.ClusterInstance

  constructor(
    name: string,
    args: DatabaseArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super('gp:database:Database', name, {}, opts)

    // This component is only for preview environments
    // For prod/dev/qa, DATABASE_URL is retrieved from AWS Secrets Manager
    if (!args.isPreview) {
      throw new Error(
        'Database component should only be used for preview environments. For production/dev/qa, use DATABASE_URL from AWS Secrets Manager.',
      )
    }

    const baseTags = args.tags || {}
    const resourceTags = {
      ...baseTags,
      Environment: 'preview',
      PR: args.prNumber || 'unknown',
    }

    const randomPassword = new random.RandomPassword(
      `${name}-db-password`,
      {
        length: 32,
        special: true,
        overrideSpecial: '!#$%&*()-_=+[]{}',
      },
      { parent: this },
    )

    const passwordSecret = new aws.secretsmanager.Secret(
      `${name}-db-pass`,
      {
        name: `gp-api-preview-db-${name}`,
        tags: resourceTags,
      },
      { parent: this },
    )

    const passwordVersion = new aws.secretsmanager.SecretVersion(
      `${name}-db-pass-ver`,
      {
        secretId: passwordSecret.id,
        secretString: randomPassword.result,
      },
      { parent: this },
    )

    this.secretArn = passwordSecret.arn

    const subnetGroup = new aws.rds.SubnetGroup(
      `${name}-subnet-group`,
      {
        subnetIds: args.subnetIds,
        tags: resourceTags,
      },
      { parent: this },
    )

    const dbSecurityGroup = new aws.ec2.SecurityGroup(
      `${name}-db-sg`,
      {
        vpcId: args.vpcId,
        description: 'Security group for preview RDS',
        ingress: [
          {
            protocol: 'tcp',
            fromPort: 5432,
            toPort: 5432,
            securityGroups: [args.ecsSecurityGroupId],
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
        tags: resourceTags,
      },
      { parent: this },
    )

    const cluster = new aws.rds.Cluster(
      `${name}-cluster`,
      {
        engine: aws.rds.EngineType.AuroraPostgresql,
        engineMode: 'provisioned',
        engineVersion: '16.4',
        databaseName: 'gp_api',
        masterUsername: 'postgres',
        masterPassword: randomPassword.result,
        dbSubnetGroupName: subnetGroup.name,
        vpcSecurityGroupIds: [dbSecurityGroup.id],
        skipFinalSnapshot: true,
        serverlessv2ScalingConfiguration: {
          minCapacity: 0.5,
          maxCapacity: 2.0,
        },
        tags: resourceTags,
      },
      { parent: this },
    )

    this.instance = new aws.rds.ClusterInstance(
      `${name}-instance`,
      {
        clusterIdentifier: cluster.id,
        instanceClass: 'db.serverless',
        engine: aws.rds.EngineType.AuroraPostgresql,
        tags: resourceTags,
      },
      { parent: this },
    )

    this.url = pulumi
      .all([randomPassword.result, cluster.endpoint])
      .apply(([password, endpoint]) => {
        const encodedPassword = encodeURIComponent(password)
        return `postgresql://postgres:${encodedPassword}@${endpoint}:5432/gp_api`
      })
    this.password = randomPassword.result
  }
}
