import * as pulumi from '@pulumi/pulumi';
import * as awsx from '@pulumi/awsx';
import * as aws from '@pulumi/aws';

export interface ComputeArgs {
  vpcId: pulumi.Input<string>;
  publicSubnetIds: pulumi.Input<string[]>;
  securityGroupId: pulumi.Input<string>;
  imageUri: pulumi.Input<string>;
  isProduction: boolean;
  certificateArn: pulumi.Input<string>;
  
  // Environment variables to inject (key-value pairs)
  environment: pulumi.Input<Record<string, pulumi.Input<string>>>;
}

export class Compute extends pulumi.ComponentResource {
  public readonly url: pulumi.Output<string>;

  constructor(
    name: string,
    args: ComputeArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super('gp:compute:Compute', name, {}, opts);

    // Create Application Load Balancer
    // Shorten name to stay under 32 char AWS limit
    const shortName = name.length > 20 ? name.substring(0, 20) : name;
    const lb = new awsx.lb.ApplicationLoadBalancer(
      `${shortName}-alb`,
      {
        subnetIds: args.publicSubnetIds,
        securityGroups: [args.securityGroupId],
        defaultTargetGroup: {
          port: 80,
          protocol: 'HTTP',
          targetType: 'ip',
          deregistrationDelay: 5,
          healthCheck: {
            path: '/health',
            interval: 30,
            timeout: 5,
            healthyThreshold: 2,
            unhealthyThreshold: 2,
            matcher: '200',
          },
        },
        listeners: [
          // HTTPS Listener (Primary)
          {
            port: 443,
            protocol: 'HTTPS',
            certificateArn: args.certificateArn,
          },
          // HTTP Listener (Redirect to HTTPS)
          {
            port: 80,
            protocol: 'HTTP',
            defaultActions: [{
              type: 'redirect',
              redirect: {
                protocol: 'HTTPS',
                port: '443',
                statusCode: 'HTTP_301',
              },
            }],
          },
        ],
      },
      { parent: this },
    );

    // Convert the environment object into the format ECS expects
    // We handle this inside the FargateService definition or transform it here.
    // awsx.ecs.FargateService taskDefinitionArgs.container.environment expects NameKeyPair[]
    // But Pulumi allows passing a generic map if we transform it.
    
    const envVars = pulumi.output(args.environment).apply(env => 
        Object.entries(env).map(([name, value]) => ({ name, value }))
    );

    // Define Fargate Service
    const service = new awsx.ecs.FargateService(
      `${shortName}-svc`,
      {
        cluster: undefined, // Use default cluster or pass one if needed
        assignPublicIp: true, // Required for Fargate in public subnets
        
        // Task Definition
        taskDefinitionArgs: {
          container: {
            name: 'gp-api',
            image: args.imageUri,
            cpu: args.isProduction ? 1024 : 256, // .25 vCPU for preview, 1 vCPU for prod
            memory: args.isProduction ? 2048 : 512, // 512MB for preview, 2GB for prod
            portMappings: [{ containerPort: 80 }],
            environment: envVars,
            logConfiguration: {
              logDriver: 'awslogs',
              options: {
                'awslogs-group': `/ecs/${name}`,
                'awslogs-region': aws.config.region,
                'awslogs-stream-prefix': 'ecs',
                'awslogs-create-group': 'true',
              },
            },
          },
        },

        // Attach to the Target Group created by the ALB
        loadBalancers: [
          {
            targetGroupArn: lb.defaultTargetGroup.arn,
            containerName: 'gp-api',
            containerPort: 80,
          },
        ],

        desiredCount: args.isProduction ? 2 : 1,
      },
      { parent: this },
    );

    this.url = lb.loadBalancer.dnsName;
  }
}
