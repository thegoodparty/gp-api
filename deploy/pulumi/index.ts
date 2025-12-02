import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import { Compute } from './components/compute';
import { Database } from './components/database';
import { Queue } from './components/queue';

const config = new pulumi.Config();
const stackName = pulumi.getStack();

// 1. Infrastructure Config
const vpcId = config.require('vpcId');
const publicSubnetIds = config.requireObject<string[]>('publicSubnetIds');
const securityGroupId = config.require('securityGroupId');
const certificateArn = config.require('certificateArn');
const imageUri = config.require('imageUri');

// 2. Secrets Config
const secretArn = config.require('secretArn');
const isPreview = config.getBoolean('isPreview') || false;
const isProduction = config.getBoolean('isProduction') || false;

// Determine Stage Name for Naming Conventions
let stageName = 'dev';
if (isPreview) {
    // e.g., gp-api-pr-123 -> pr-123
    const parts = stackName.split('-');
    if (stackName.includes('pr-')) {
        stageName = `pr-${parts[parts.length - 1]}`;
    }
} else if (isProduction) {
    stageName = 'prod';
} else {
    // Default to 'dev' for non-prod, non-preview stacks (like develop-shadow)
    stageName = 'dev';
}

// 3. Queues
const queue = new Queue(`${stackName}-queue`, {
    isPreview,
    namePrefix: stageName,
});

// Fetch and Parse Secret
const secretVersion = aws.secretsmanager.getSecretVersionOutput({ secretId: secretArn });
const secretData = secretVersion.secretString.apply(s => {
    const parsed = JSON.parse(s || '{}');
    delete parsed.AWS_ACCESS_KEY_ID;
    delete parsed.AWS_SECRET_ACCESS_KEY;
    delete parsed.AWS_S3_KEY;
    delete parsed.AWS_S3_SECRET;
    return parsed as Record<string, string>;
});

// 4. Database Logic
let databaseUrl: pulumi.Output<string>;

if (isPreview) {
    const db = new Database(`${stackName}-db`, {
        vpcId,
        subnetIds: publicSubnetIds,
        securityGroupId,
        isPreview: true,
    });
    databaseUrl = db.url;
} else {
    databaseUrl = secretData.apply(s => s.DATABASE_URL);
}

// 5. Prepare Environment Variables
const finalEnvVars = pulumi.all([secretData, databaseUrl, queue.queueName, queue.queueUrl]).apply(([data, dbUrl, qName, qUrl]) => ({
    ...data,
    DATABASE_URL: dbUrl,
    NODE_ENV: isProduction ? 'production' : 'development',
    SQS_QUEUE: qName,
    // Construct base URL by removing the queue name from the full URL
    SQS_QUEUE_BASE_URL: qUrl.replace(`/${qName}`, ''),
}));

// 6. Compute
const compute = new Compute(`${stackName}-compute`, {
    vpcId,
    publicSubnetIds,
    securityGroupId,
    imageUri,
    isProduction,
    certificateArn,
    environment: finalEnvVars,
});

export const serviceUrl = compute.url;
