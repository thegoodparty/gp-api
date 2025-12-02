import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';

export interface DatabaseArgs {
  vpcId: pulumi.Input<string>;
  subnetIds: pulumi.Input<string[]>;
  securityGroupId: pulumi.Input<string>;
  isPreview: boolean;
  // For importing existing DB (prod/dev) or naming new ones
  clusterIdentifier?: string;
}

export class Database extends pulumi.ComponentResource {
  public readonly url: pulumi.Output<string>;
  public readonly secretArn: pulumi.Output<string>;
  public readonly instance?: aws.rds.ClusterInstance;

  constructor(
    name: string,
    args: DatabaseArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super('gp:database:Database', name, {}, opts);

    if (args.isPreview) {
      const password = new aws.secretsmanager.Secret(`${name}-db-pass`, {
          name: `gp-api-preview-db-${name}`,
      }, { parent: this });
      
      const passwordVersion = new aws.secretsmanager.SecretVersion(`${name}-db-pass-ver`, {
          secretId: password.id,
          secretString: "superSecretPreviewPassword123!",
      }, { parent: this });

      this.secretArn = password.arn;

      const subnetGroup = new aws.rds.SubnetGroup(`${name}-subnet-group`, {
          subnetIds: args.subnetIds,
      }, { parent: this });

      const cluster = new aws.rds.Cluster(`${name}-cluster`, {
          engine: aws.rds.EngineType.AuroraPostgresql,
          engineMode: "provisioned",
          engineVersion: "16.4",
          databaseName: "gp_api",
          masterUsername: "postgres",
          masterPassword: passwordVersion.secretString.apply(s => s ?? "defaultpass"),
          dbSubnetGroupName: subnetGroup.name,
          vpcSecurityGroupIds: [args.securityGroupId],
          skipFinalSnapshot: true,
          serverlessv2ScalingConfiguration: {
              minCapacity: 0.5,
              maxCapacity: 2.0,
          },
      }, { parent: this });

      this.instance = new aws.rds.ClusterInstance(`${name}-instance`, {
          clusterIdentifier: cluster.id,
          instanceClass: "db.serverless",
          engine: aws.rds.EngineType.AuroraPostgresql,
      }, { parent: this });

      this.url = pulumi.interpolate`postgresql://postgres:${passwordVersion.secretString}@${cluster.endpoint}:5432/gp_api`;

    } else {
        // Production/Dev: We assume the DB exists.
        this.url = pulumi.output("EXISTING_DB_URL_SHOULD_BE_PASSED_IN");
        this.secretArn = pulumi.output("EXISTING_SECRET_ARN");
    }
  }
}
