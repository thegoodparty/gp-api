import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';

export interface MonitoringArgs {
  serviceName: pulumi.Input<string>;
  loadBalancerArnSuffix: pulumi.Input<string>;
  targetGroupArnSuffix: pulumi.Input<string>;
  clusterName: pulumi.Input<string>;
  rdsClusterIdentifier?: pulumi.Input<string>;
}

export class Monitoring extends pulumi.ComponentResource {
  constructor(name: string, args: MonitoringArgs, opts?: pulumi.ComponentResourceOptions) {
    super('gp:monitoring:Monitoring', name, {}, opts);

    const dashboardBody = pulumi.all([
        args.serviceName, 
        args.clusterName, 
        args.loadBalancerArnSuffix, 
        args.targetGroupArnSuffix,
        args.rdsClusterIdentifier
    ]).apply(([serviceName, clusterName, lbArnSuffix, tgArnSuffix, rdsId]) => {
        
        const widgets: any[] = [
            {
                type: "metric",
                x: 0, y: 0, width: 12, height: 6,
                properties: {
                    metrics: [
                        ["AWS/ECS", "CPUUtilization", "ServiceName", serviceName, "ClusterName", clusterName],
                        [".", "MemoryUtilization", ".", ".", ".", "."]
                    ],
                    view: "timeSeries",
                    stacked: false,
                    region: "us-west-2",
                    title: "ECS Utilization"
                }
            },
            {
                type: "metric",
                x: 12, y: 0, width: 12, height: 6,
                properties: {
                    metrics: [
                        ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", lbArnSuffix],
                        [".", "HTTPCode_Target_5XX_Count", ".", "."],
                        [".", "HTTPCode_ELB_5XX_Count", ".", "."]
                    ],
                    view: "timeSeries",
                    stacked: false,
                    region: "us-west-2",
                    title: "ALB Requests & Errors"
                }
            }
        ];

        if (rdsId) {
            widgets.push({
                type: "metric",
                x: 0, y: 6, width: 12, height: 6,
                properties: {
                    metrics: [
                        ["AWS/RDS", "CPUUtilization", "DBClusterIdentifier", rdsId],
                        [".", "DatabaseConnections", ".", "."]
                    ],
                    view: "timeSeries",
                    stacked: false,
                    region: "us-west-2",
                    title: "RDS Performance"
                }
            });
        }

        return JSON.stringify({ widgets });
    });

    new aws.cloudwatch.Dashboard(`${name}-dashboard`, {
        dashboardName: `${name}-dashboard`,
        dashboardBody: dashboardBody,
    }, { parent: this });
  }
}

