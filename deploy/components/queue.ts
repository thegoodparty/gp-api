import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';

export interface QueueArgs {
  isPreview: boolean;
  prNumber?: string;
  namePrefix: string;
  tags?: Record<string, string>;
}

export class Queue extends pulumi.ComponentResource {
  public readonly queueUrl: pulumi.Output<string>;
  public readonly queueArn: pulumi.Output<string>;
  public readonly queueName: pulumi.Output<string>;

  constructor(
    name: string,
    args: QueueArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super('gp:queue:Queue', name, {}, opts);


    // Actually, we should just use the namePrefix passed in, which should be the 'stage' name.
    // In index.ts, we need to determine what the "stage" name is.
    // If stack is 'gp-api-develop-shadow', stage is 'dev'.
    // If stack is 'gp-api-pr-123', stage is 'pr-123'.
    
    const stageName = args.namePrefix;
    const queueName = `${stageName}-Queue.fifo`;
    const dlqName = `${stageName}-DLQ.fifo`;

    if (args.isPreview) {
        const baseTags = args.tags || {};
        const resourceTags = { ...baseTags, Environment: 'preview', PR: args.prNumber || 'unknown' };

        const dlq = new aws.sqs.Queue(`${name}-dlq`, {
            name: dlqName,
            fifoQueue: true,
            messageRetentionSeconds: 604800,
            tags: resourceTags,
        }, { parent: this });

        const queue = new aws.sqs.Queue(`${name}-queue`, {
            name: queueName,
            fifoQueue: true,
            messageRetentionSeconds: 604800,
            visibilityTimeoutSeconds: 300,
            deduplicationScope: 'messageGroup',
            fifoThroughputLimit: 'perMessageGroupId',
            redrivePolicy: pulumi.interpolate`{
                "deadLetterTargetArn": "${dlq.arn}",
                "maxReceiveCount": 3
            }`,
            tags: resourceTags,
        }, { parent: this });

        this.queueUrl = queue.url;
        this.queueArn = queue.arn;
        this.queueName = queue.name;

    } else {
        // For Prod/Dev/Shadow:
        // We assume the queue ALREADY exists (managed by old SST or manually).
        // We lookup the queue to get its URL/ARN without managing it.
        // This prevents us from accidentally modifying/deleting the production queue.
        
        const queue = aws.sqs.getQueueOutput({ name: queueName }, { parent: this });
        this.queueUrl = queue.url;
        this.queueArn = queue.arn;
        this.queueName = pulumi.output(queueName);
    }
  }
}

