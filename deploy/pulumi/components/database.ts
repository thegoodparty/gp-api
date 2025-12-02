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

  constructor(
    name: string,
    args: DatabaseArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super('gp:database:Database', name, {}, opts);

    if (args.isPreview) {
      // Create NEW Aurora Serverless v2 Cluster for Previews
      
      // 1. Create Random Password
      const password = new aws.secretsmanager.Secret(`${name}-db-pass`, {
          name: `gp-api-preview-db-${name}-${Date.now()}`,
      }, { parent: this });
      
      const passwordVersion = new aws.secretsmanager.SecretVersion(`${name}-db-pass-ver`, {
          secretId: password.id,
          secretString: "superSecretPreviewPassword123!", // In real usage, generate random
      }, { parent: this });

      this.secretArn = password.arn;

      // 2. Create Subnet Group
      const subnetGroup = new aws.rds.SubnetGroup(`${name}-subnet-group`, {
          subnetIds: args.subnetIds,
      }, { parent: this });

      // 3. Create Cluster
      const cluster = new aws.rds.Cluster(`${name}-cluster`, {
          engine: aws.rds.EngineType.AuroraPostgresql,
          engineMode: "provisioned",
          engineVersion: "15.4",
          databaseName: "gp_api",
          masterUsername: "postgres",
          masterPassword: passwordVersion.secretString.apply(s => s ?? "defaultpass"),
          dbSubnetGroupName: subnetGroup.name,
          vpcSecurityGroupIds: [args.securityGroupId],
          skipFinalSnapshot: true, // Important for ephemeral preview DBs
          serverlessv2ScalingConfiguration: {
              minCapacity: 0.5,
              maxCapacity: 2.0,
          },
      }, { parent: this });

      // 4. Create Instance (Required for Serverless v2)
      const instance = new aws.rds.ClusterInstance(`${name}-instance`, {
          clusterIdentifier: cluster.id,
          instanceClass: "db.serverless",
          engine: aws.rds.EngineType.AuroraPostgresql,
          engineVersion: cluster.engineVersion,
      }, { parent: this });

      this.url = pulumi.interpolate`postgresql://postgres:${passwordVersion.secretString}@${cluster.endpoint}:5432/gp_api`;

    } else {
        // Production/Dev: We assume the DB exists.
        this.url = pulumi.output("EXISTING_DB_URL_SHOULD_BE_PASSED_IN");
        this.secretArn = pulumi.output("EXISTING_SECRET_ARN");
    }
  }
}
