import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import { Compute } from './components/compute';
import { Database } from './components/database';
import { Queue } from './components/queue';
import { InngestWorker } from './components/inngestWorker';

const config = new pulumi.Config();
const stackName = pulumi.getStack();

// 1. Infrastructure Config
const vpcId = config.require('vpcId');
const publicSubnetIds = config.requireObject<string[]>('publicSubnetIds');
const privateSubnetIds = config.requireObject<string[]>('privateSubnetIds');
const securityGroupId = config.require('securityGroupId');
const certificateArn = config.require('certificateArn');
const imageUri = config.require('imageUri');

// 2. Secrets Config
const secretArn = config.require('secretArn');
const isPreview = config.getBoolean('isPreview') || false;
const isProduction = config.getBoolean('isProduction') || false;
const isQa = config.getBoolean('isQa') || false;

// 3. Determine stage name
let stageName = 'dev';
let prNumber: string | undefined;

if (isPreview) {
    const parts = stackName.split('-');
    if (stackName.includes('pr-')) {
        prNumber = parts[parts.length - 1];
        stageName = `pr-${prNumber}`;
    }
} else if (isProduction) {
    stageName = 'prod';
} else if (isQa) {
    stageName = 'qa';
} else {
    stageName = 'dev';
}

// 4. DNS Config
const HOSTED_ZONE_ID = 'Z10392302OXMPNQLPO07K';
const DOMAINS: Record<string, string> = {
    prod: 'gp-api.goodparty.org',
    dev: 'gp-api-dev.goodparty.org',
    qa: 'gp-api-qa.goodparty.org',
};
const hostedZoneId = config.get('hostedZoneId') || HOSTED_ZONE_ID;
const domain = config.get('domain') || DOMAINS[stageName];

// 5. Preview Environment Config (optional)
const previewCertificateArn = config.get('previewCertificateArn');
const previewHostedZoneId = config.get('previewHostedZoneId');
const previewDomain = config.get('previewDomain') || 'preview.goodparty.org';

// 6. Test Credentials (for preview seeding)
const adminEmail = config.get('adminEmail');
const adminPassword = config.getSecret('adminPassword');
const candidateEmail = config.get('candidateEmail');
const candidatePassword = config.getSecret('candidatePassword');

const baseTags = {
    Project: 'gp-api',
    ManagedBy: 'pulumi',
    Stack: stackName,
};

const shortName = stackName.length > 20 ? stackName.substring(0, 20) : stackName;
const resourceTags = isPreview 
    ? { ...baseTags, Environment: 'preview', PR: prNumber || 'unknown' }
    : { ...baseTags, Environment: isProduction ? 'Production' : 'Development' };

const taskSecurityGroup = new aws.ec2.SecurityGroup(`${shortName}-task-sg`, {
    vpcId,
    description: 'Security group for ECS tasks',
    ingress: [
        {
            protocol: 'tcp',
            fromPort: 80,
            toPort: 80,
            securityGroups: [securityGroupId],
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
});

const queue = new Queue(`${stackName}-queue`, {
    isPreview,
    prNumber,
    namePrefix: stageName,
    tags: baseTags,
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
let dbDependency: pulumi.Resource | undefined;
let dbPassword: pulumi.Output<string> | undefined;

if (isPreview) {
    const db = new Database(`${stackName}-db`, {
        vpcId,
        subnetIds: privateSubnetIds,
        securityGroupId,
        ecsSecurityGroupId: taskSecurityGroup.id,
        isPreview: true,
        prNumber,
        tags: baseTags,
    });
    databaseUrl = db.url;
    dbDependency = db.instance;
    dbPassword = db.password;
} else {
    databaseUrl = secretData.apply(s => s.DATABASE_URL);
}

// 6. Prepare Environment Variables
const finalEnvVars = pulumi.all([
    secretData, 
    databaseUrl, 
    queue.queueName, 
    queue.queueUrl,
    adminEmail || '',
    adminPassword || pulumi.output(''),
    candidateEmail || '',
    candidatePassword || pulumi.output(''),
]).apply(([data, dbUrl, qName, qUrl, aEmail, aPass, cEmail, cPass]) => {
    const baseEnv: Record<string, string> = {
    ...data,
    DATABASE_URL: dbUrl,
    NODE_ENV: 'production',
        IS_PREVIEW: isPreview ? 'true' : 'false',
    SQS_QUEUE: qName,
    SQS_QUEUE_BASE_URL: qUrl.replace(`/${qName}`, ''),
    PORT: '80',
    HOST: '0.0.0.0',
    };

    if (isPreview && aEmail && aPass && cEmail && cPass) {
        baseEnv.ADMIN_EMAIL = aEmail;
        baseEnv.ADMIN_PASSWORD = aPass;
        baseEnv.CANDIDATE_EMAIL = cEmail;
        baseEnv.CANDIDATE_PASSWORD = cPass;
    }

    return baseEnv;
});

const computeDeps = dbDependency ? { dependsOn: [dbDependency] } : undefined;
const effectiveCertArn = isPreview && previewCertificateArn ? previewCertificateArn : certificateArn;

const effectiveHostedZoneId = isPreview ? previewHostedZoneId : hostedZoneId;
const effectiveDomain = isPreview ? previewDomain : domain;

const compute = new Compute(`${stackName}-compute`, {
    vpcId,
    publicSubnetIds,
    privateSubnetIds,
    securityGroupId,
    taskSecurityGroup: taskSecurityGroup,
    imageUri,
    isProduction,
    isPreview,
    prNumber,
    certificateArn: effectiveCertArn,
    environment: finalEnvVars,
    queueArn: queue.queueArn,
    tags: baseTags,
    hostedZoneId: effectiveHostedZoneId,
    domain: effectiveDomain,
}, computeDeps);

// Inngest Worker Service
const inngestWorker = new InngestWorker(`${stackName}-inngest-worker`, {
    vpcId,
    publicSubnetIds,
    privateSubnetIds,
    taskSecurityGroup: taskSecurityGroup,
    imageUri,
    isProduction,
    isPreview,
    prNumber,
    environment: finalEnvVars.apply(env => ({
        ...env,
        INNGEST_SIGNING_KEY: env.INNGEST_SIGNING_KEY || '',
        WORKER_PORT: '3002',
    })),
    queueArn: queue.queueArn,
    s3BucketArns: [], // Add S3 bucket ARNs if needed
    tags: baseTags,
}, computeDeps);

export const serviceUrl = compute.url;
export const databasePassword = dbPassword;
export const workerServiceName = inngestWorker.serviceName;
